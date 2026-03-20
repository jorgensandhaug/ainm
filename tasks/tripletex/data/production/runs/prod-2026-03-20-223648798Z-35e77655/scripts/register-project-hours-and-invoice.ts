const BASE_URL = process.env.TRIPLETEX_BASE_URL;
const SESSION_TOKEN = process.env.TRIPLETEX_SESSION_TOKEN;

if (!BASE_URL || !SESSION_TOKEN) {
  throw new Error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_SESSION_TOKEN");
}

const RUN_DATE = "2026-03-20";
const EMPLOYEE_EMAIL = "ingrid.nilsen@example.org";
const PROJECT_NAME = "Plattformintegrasjon";
const CUSTOMER_ORG_NO = "989231898";
const CUSTOMER_NAME = "Bergvik AS";
const ACTIVITY_NAME = "Analyse";
const HOURS = 5;
const HOURLY_RATE = 1400;
const BANK_ACCOUNT_NUMBER = "12345678903";

class HttpError extends Error {
  status: number;
  body: any;

  constructor(status: number, body: any, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

function authHeader() {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const url = new URL(path, base);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function tripletex<T = any>(
  method: string,
  path: string,
  opts: { query?: Record<string, string | number | boolean | undefined>; body?: any } = {},
): Promise<T> {
  const response = await fetch(buildUrl(path, opts.query), {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;

  if (
    response.status === 403 &&
    (parsed?.error === "Invalid or expired token" ||
      parsed?.error === "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.")
  ) {
    throw new Error(`Blocked credentials: ${parsed.error}`);
  }

  if (!response.ok) {
    throw new HttpError(response.status, parsed, `${method} ${path} failed`);
  }

  return parsed as T;
}

function exactOne<T>(items: T[], predicate: (item: T) => boolean, label: string): T {
  const matches = items.filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`${label}: expected exactly 1 match, got ${matches.length}`);
  }
  return matches[0]!;
}

function unwrapValues<T>(wrapper: any): T[] {
  if (!wrapper || !Array.isArray(wrapper.values)) {
    throw new Error("Expected list response wrapper");
  }
  return wrapper.values as T[];
}

function unwrapValue<T>(wrapper: any): T {
  if (!wrapper || wrapper.value === undefined) {
    throw new Error("Expected object response wrapper");
  }
  return wrapper.value as T;
}

function hasMissingBankAccountError(body: any): boolean {
  const blob = JSON.stringify(body ?? {});
  return blob.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.");
}

async function invoiceOrder(orderId: number) {
  return tripletex("PUT", `order/${orderId}/:invoice`, {
    query: {
      invoiceDate: RUN_DATE,
      sendToCustomer: false,
    },
  });
}

async function repairBankAccountAndRetry(orderId: number) {
  const ledgerAccounts = unwrapValues<any>(
    await tripletex("GET", "ledger/account", {
      query: {
        isBankAccount: true,
        fields: "*",
      },
    }),
  );

  const invoiceAccount =
    ledgerAccounts.find((account) => account.isInvoiceAccount) ??
    ledgerAccounts.find((account) => account.number === 1920 || account.number === "1920") ??
    ledgerAccounts[0];

  if (!invoiceAccount?.id) {
    throw new Error("No bank account available for invoice repair");
  }

  await tripletex("PUT", `ledger/account/${invoiceAccount.id}`, {
    body: {
      bankAccountNumber: BANK_ACCOUNT_NUMBER,
    },
  });

  return invoiceOrder(orderId);
}

async function main() {
  const employee = exactOne<any>(
    unwrapValues<any>(
      await tripletex("GET", "employee", {
        query: {
          email: EMPLOYEE_EMAIL,
          count: 10,
          fields: "*",
        },
      }),
    ),
    (item) => item.email === EMPLOYEE_EMAIL,
    "employee",
  );

  const project = exactOne<any>(
    unwrapValues<any>(
      await tripletex("GET", "project", {
        query: {
          name: PROJECT_NAME,
          count: 50,
          fields: "*,customer(*)",
        },
      }),
    ),
    (item) =>
      item.name === PROJECT_NAME &&
      item.customer?.organizationNumber === CUSTOMER_ORG_NO &&
      item.customer?.name === CUSTOMER_NAME,
    "project",
  );

  const activity = exactOne<any>(
    unwrapValues<any>(
      await tripletex("GET", "activity/>forTimeSheet", {
        query: {
          projectId: project.id,
          employeeId: employee.id,
          date: RUN_DATE,
          query: ACTIVITY_NAME,
          filterExistingHours: false,
          count: 50,
          fields: "*",
        },
      }),
    ),
    (item) => item.name === ACTIVITY_NAME,
    "activity",
  );

  if (activity.isChargeable === true) {
    const holderValues = unwrapValues<any>(
      await tripletex("GET", "project/hourlyRates", {
        query: {
          projectId: project.id,
          count: 100,
          fields: "*,projectSpecificRates(*,employee(*),activity(*))",
        },
      }),
    );

    let holder =
      holderValues.find((item) => item.project?.id === project.id || item.project === project.id) ??
      holderValues[0];

    if (!holder) {
      holder = unwrapValue<any>(
        await tripletex("POST", "project/hourlyRates", {
          body: {
            project: { id: project.id },
            startDate: RUN_DATE,
            hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
          },
        }),
      );
    } else if (holder.hourlyRateModel !== "TYPE_PROJECT_SPECIFIC_HOURLY_RATES") {
      holder = unwrapValue<any>(
        await tripletex("PUT", `project/hourlyRates/${holder.id}`, {
          body: {
            project: { id: project.id },
            startDate: holder.startDate ?? RUN_DATE,
            hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
          },
        }),
      );
    }

    const existingRate = (holder.projectSpecificRates ?? []).find(
      (item: any) => item.employee?.id === employee.id && item.activity?.id === activity.id,
    );

    if (!existingRate) {
      await tripletex("POST", "project/hourlyRates/projectSpecificRates", {
        body: {
          projectHourlyRate: { id: holder.id },
          employee: { id: employee.id },
          activity: { id: activity.id },
          hourlyRate: HOURLY_RATE,
        },
      });
    } else if (existingRate.hourlyRate !== HOURLY_RATE) {
      await tripletex("PUT", `project/hourlyRates/projectSpecificRates/${existingRate.id}`, {
        body: {
          projectHourlyRate: { id: holder.id },
          employee: { id: employee.id },
          activity: { id: activity.id },
          hourlyRate: HOURLY_RATE,
        },
      });
    }
  }

  const timesheetEntry = unwrapValue<any>(
    await tripletex("POST", "timesheet/entry", {
      body: {
        employee: { id: employee.id },
        project: { id: project.id },
        activity: { id: activity.id },
        date: RUN_DATE,
        hours: HOURS,
        projectChargeableHours: HOURS,
      },
    }),
  );

  const vatType = unwrapValues<any>(
    await tripletex("GET", "ledger/vatType", {
      query: {
        typeOfVat: "OUTGOING",
        vatDate: RUN_DATE,
        fields: "*",
      },
    }),
  )[0];

  if (!vatType?.id) {
    throw new Error("No outgoing VAT type found");
  }

  const order = unwrapValue<any>(
    await tripletex("POST", "order", {
      body: {
        customer: { id: project.customer.id },
        project: { id: project.id },
        orderDate: RUN_DATE,
        deliveryDate: RUN_DATE,
        orderLines: [
          {
            description: ACTIVITY_NAME,
            count: HOURS,
            unitPriceExcludingVatCurrency: HOURLY_RATE,
            vatType: { id: vatType.id },
          },
        ],
      },
    }),
  );

  let invoiceWrapper: any;
  try {
    invoiceWrapper = await invoiceOrder(order.id);
  } catch (error) {
    if (error instanceof HttpError && error.status === 422 && hasMissingBankAccountError(error.body)) {
      invoiceWrapper = await repairBankAccountAndRetry(order.id);
    } else {
      throw error;
    }
  }

  const invoice = unwrapValue<any>(invoiceWrapper);

  console.log(
    JSON.stringify(
      {
        employeeId: employee.id,
        projectId: project.id,
        activityId: activity.id,
        activityIsChargeable: activity.isChargeable,
        timesheetEntryId: timesheetEntry.id,
        timesheetHourlyRate: timesheetEntry.hourlyRate,
        timesheetChargeable: timesheetEntry.chargeable,
        orderId: order.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
        amountCurrencyOutstanding: invoice.amountCurrencyOutstanding,
      },
      null,
      2,
    ),
  );
}

await main();
