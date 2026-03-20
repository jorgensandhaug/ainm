const BASE_URL = process.env.TRIPLETEX_BASE_URL;
const SESSION_TOKEN = process.env.TRIPLETEX_SESSION_TOKEN;

if (!BASE_URL || !SESSION_TOKEN) {
  throw new Error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_SESSION_TOKEN");
}

const EMPLOYEE_EMAIL = "codex.verify.1773957815637@example.org";
const PROJECT_NAME = "Sandbox Hour Invoice Project 1774020541520";
const ACTIVITY_NAME = "Prosjektadministrasjon";
const HOURS = 5;
const HOURLY_RATE = 1400;
const CANDIDATE_DATE = "2026-06-18";
const PROVEN_DATE = "2026-06-19";
const BANK_ACCOUNT_NUMBER = "12345678903";

class HttpError extends Error {
  status: number;
  body: any;
  path: string;

  constructor(status: number, body: any, path: string) {
    super(`${path} failed with ${status}`);
    this.status = status;
    this.body = body;
    this.path = path;
  }
}

const calls: string[] = [];

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
  calls.push(`${method} ${path}`);
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
  if (!response.ok) {
    throw new HttpError(response.status, parsed, path);
  }
  return parsed as T;
}

function unwrapValues<T>(wrapper: any): T[] {
  if (!Array.isArray(wrapper?.values)) {
    throw new Error("Expected list wrapper");
  }
  return wrapper.values as T[];
}

function unwrapValue<T>(wrapper: any): T {
  if (wrapper?.value === undefined) {
    throw new Error("Expected object wrapper");
  }
  return wrapper.value as T;
}

function exactOne<T>(items: T[], predicate: (item: T) => boolean, label: string): T {
  const matches = items.filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`${label}: expected exactly 1 match, got ${matches.length}`);
  }
  return matches[0]!;
}

function hasMissingBankAccountError(body: any): boolean {
  return JSON.stringify(body ?? {}).includes(
    "Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.",
  );
}

async function registerHours(employeeId: number, projectId: number, activityId: number, date: string) {
  return unwrapValue<any>(
    await tripletex("POST", "timesheet/entry", {
      body: {
        employee: { id: employeeId },
        project: { id: projectId },
        activity: { id: activityId },
        date,
        hours: HOURS,
        projectChargeableHours: HOURS,
      },
    }),
  );
}

async function createOrder(customerId: number, projectId: number, date: string, vatTypeId?: number) {
  return unwrapValue<any>(
    await tripletex("POST", "order", {
      body: {
        customer: { id: customerId },
        project: { id: projectId },
        orderDate: date,
        deliveryDate: date,
        orderLines: [
          {
            description: ACTIVITY_NAME,
            count: HOURS,
            unitPriceExcludingVatCurrency: HOURLY_RATE,
            ...(vatTypeId ? { vatType: { id: vatTypeId } } : {}),
          },
        ],
      },
    }),
  );
}

async function invoiceOrder(orderId: number, date: string) {
  try {
    return await tripletex("PUT", `order/${orderId}/:invoice`, {
      query: {
        invoiceDate: date,
        sendToCustomer: false,
      },
    });
  } catch (error) {
    if (error instanceof HttpError && error.status === 422 && hasMissingBankAccountError(error.body)) {
      const accounts = unwrapValues<any>(
        await tripletex("GET", "ledger/account", {
          query: {
            isBankAccount: true,
            fields: "*",
          },
        }),
      );
      const account =
        accounts.find((item) => item.isInvoiceAccount) ??
        accounts.find((item) => item.number === 1920 || item.number === "1920") ??
        accounts[0];
      await tripletex("PUT", `ledger/account/${account.id}`, {
        body: {
          bankAccountNumber: BANK_ACCOUNT_NUMBER,
        },
      });
      return tripletex("PUT", `order/${orderId}/:invoice`, {
        query: {
          invoiceDate: date,
          sendToCustomer: false,
        },
      });
    }
    throw error;
  }
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
    (item) => item.name === PROJECT_NAME,
    "project",
  );

  const activity = exactOne<any>(
    unwrapValues<any>(
      await tripletex("GET", "activity/>forTimeSheet", {
        query: {
          projectId: project.id,
          employeeId: employee.id,
          date: CANDIDATE_DATE,
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

  if (activity.isChargeable !== false) {
    throw new Error(`Expected non-chargeable analog, got isChargeable=${activity.isChargeable}`);
  }

  const candidateStart = calls.length;
  const candidateTimesheet = await registerHours(employee.id, project.id, activity.id, CANDIDATE_DATE);

  let candidateResult: any = {
    success: false,
    error: null,
    calls: 0,
    timesheetEntryId: candidateTimesheet.id,
  };

  try {
    const order = await createOrder(project.customer.id, project.id, CANDIDATE_DATE);
    const invoice = unwrapValue<any>(await invoiceOrder(order.id, CANDIDATE_DATE));
    candidateResult = {
      success: true,
      calls: calls.length - candidateStart,
      orderId: order.id,
      invoiceId: invoice.id,
      amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
      amountCurrencyOutstanding: invoice.amountCurrencyOutstanding,
    };
  } catch (error) {
    candidateResult = {
      success: false,
      calls: calls.length - candidateStart,
      error:
        error instanceof HttpError
          ? {
              status: error.status,
              path: error.path,
              body: error.body,
            }
          : String(error),
    };
  }

  const provenStart = calls.length;
  const provenTimesheet = await registerHours(employee.id, project.id, activity.id, PROVEN_DATE);
  const vatType = unwrapValues<any>(
    await tripletex("GET", "ledger/vatType", {
      query: {
        typeOfVat: "OUTGOING",
        vatDate: PROVEN_DATE,
        fields: "*",
      },
    }),
  )[0];
  const provenOrder = await createOrder(project.customer.id, project.id, PROVEN_DATE, vatType.id);
  const provenInvoice = unwrapValue<any>(await invoiceOrder(provenOrder.id, PROVEN_DATE));

  console.log(
    JSON.stringify(
      {
        resolved: {
          employeeId: employee.id,
          projectId: project.id,
          customerId: project.customer.id,
          activityId: activity.id,
          activityIsChargeable: activity.isChargeable,
        },
        candidateWithoutVatType: candidateResult,
        provenWithVatType: {
          calls: calls.length - provenStart,
          timesheetEntryId: provenTimesheet.id,
          orderId: provenOrder.id,
          invoiceId: provenInvoice.id,
          invoiceNumber: provenInvoice.invoiceNumber,
          amountExcludingVatCurrency: provenInvoice.amountExcludingVatCurrency,
          amountCurrencyOutstanding: provenInvoice.amountCurrencyOutstanding,
          vatTypeId: vatType.id,
        },
        totalCalls: calls.length,
        callLog: calls,
      },
      null,
      2,
    ),
  );
}

await main();
