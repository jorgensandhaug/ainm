const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "t5aWk15wycvpVqQIrW4iRuKIbSnvzKSwaS4e-JLcnZg";

const PROMPT = {
  employeeEmail: "camille.dubois@example.org",
  projectName: "Mise à niveau système",
  activityName: "Design",
  customerOrganizationNumber: "953748460",
  hours: 16,
  hourlyRate: 1300,
  today: "2026-03-21",
  bankAccountNumber: "12345678903",
} as const;

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

class ApiError extends Error {
  status: number;
  bodyText: string;
  bodyJson: any;
  method: string;
  path: string;

  constructor(method: string, path: string, status: number, bodyText: string, bodyJson: any) {
    super(`${method} ${path} failed with ${status}`);
    this.method = method;
    this.path = path;
    this.status = status;
    this.bodyText = bodyText;
    this.bodyJson = bodyJson;
  }
}

function normalizeString(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function buildUrl(path: string, query?: Record<string, string | number | boolean | Array<string | number | boolean>>) {
  const base = BASE_URL.replace(/\/+$/, "");
  const cleanPath = path.replace(/^\/+/, "");
  const url = new URL(`${base}/${cleanPath}`);
  if (query) {
    for (const [key, rawValue] of Object.entries(query)) {
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      for (const value of values) {
        url.searchParams.append(key, String(value));
      }
    }
  }
  return url.toString();
}

function unwrapResponse(json: any): any {
  if (json?.values !== undefined) return json.values;
  if (json?.value !== undefined) return json.value;
  return json;
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function isInvalidTokenError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const message = error.bodyJson?.error;
  return (
    error.status === 403 &&
    (message === "Invalid or expired token" ||
      message === "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.")
  );
}

async function request(method: string, path: string, options: { query?: Record<string, any>; body?: Json } = {}) {
  const response = await fetch(buildUrl(path, options.query), {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`,
      Accept: "application/json",
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const bodyText = await response.text();
  const bodyJson = bodyText ? safeJsonParse(bodyText) : null;
  if (!response.ok) {
    throw new ApiError(method, path, response.status, bodyText, bodyJson);
  }
  if (!bodyText) return null;
  return unwrapResponse(bodyJson);
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function requireExact<T>(items: T[], predicate: (item: T) => boolean, label: string): T {
  const matches = items.filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`${label}: expected exactly 1 match, got ${matches.length}`);
  }
  return matches[0];
}

function collectDateCandidates(value: any): string[] {
  const results: string[] = [];
  if (!value || typeof value !== "object") return results;
  if (typeof value.startDate === "string") results.push(value.startDate);
  if (Array.isArray(value.employments)) {
    for (const employment of value.employments) {
      if (employment && typeof employment.startDate === "string") results.push(employment.startDate);
    }
  }
  return results.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
}

function maxIsoDate(...dates: Array<string | undefined | null>): string {
  return dates
    .filter((value): value is string => Boolean(value) && /^\d{4}-\d{2}-\d{2}$/.test(String(value)))
    .sort()
    .at(-1)!;
}

function resolveVatPercent(vatType: any): number | null {
  for (const key of ["rate", "percentage", "percent", "value"]) {
    const raw = vatType?.[key];
    if (typeof raw === "number") return raw;
    if (typeof raw === "string" && raw.trim() !== "") {
      const parsed = Number(raw.replace(",", "."));
      if (!Number.isNaN(parsed)) return parsed;
    }
  }

  for (const key of ["displayName", "name", "description"]) {
    const raw = vatType?.[key];
    if (typeof raw === "string") {
      const match = raw.match(/(\d+(?:[.,]\d+)?)\s*%/);
      if (match) return Number(match[1].replace(",", "."));
    }
  }

  return null;
}

function chooseOutgoingVatType(vatTypes: any[]) {
  if (vatTypes.length === 0) {
    throw new Error("No outgoing VAT types returned");
  }
  if (vatTypes.length === 1) {
    return vatTypes[0];
  }

  const exact25 = vatTypes.filter((vatType) => resolveVatPercent(vatType) === 25);
  if (exact25.length >= 1) {
    return exact25.find((vatType) => String(vatType?.number ?? "") === "3") ?? exact25[0];
  }

  const nonZero = vatTypes.filter((vatType) => (resolveVatPercent(vatType) ?? 0) > 0);
  if (nonZero.length === 1) {
    return nonZero[0];
  }

  throw new Error(`Ambiguous outgoing VAT type set: ${JSON.stringify(vatTypes)}`);
}

function chooseInvoiceBankAccount(accounts: any[]) {
  if (accounts.length === 0) {
    throw new Error("No bank accounts returned");
  }

  return (
    accounts.find((account) => account?.isInvoiceAccount === true) ??
    accounts.find((account) => String(account?.number ?? account?.accountNumber ?? "") === "1920") ??
    accounts[0]
  );
}

async function main() {
  try {
    const employees = asArray(
      await request("GET", "employee", {
        query: {
          email: PROMPT.employeeEmail,
          count: 10,
          fields: "*",
        },
      }),
    );
    const employee = requireExact(
      employees,
      (item) => normalizeString((item as any)?.email) === normalizeString(PROMPT.employeeEmail),
      "employee",
    );

    const projects = asArray(
      await request("GET", "project", {
        query: {
          name: PROMPT.projectName,
          count: 50,
          fields: "*,customer(*)",
        },
      }),
    );
    const project = requireExact(
      projects,
      (item) =>
        normalizeString((item as any)?.name) === normalizeString(PROMPT.projectName) &&
        normalizeString((item as any)?.customer?.organizationNumber) === normalizeString(PROMPT.customerOrganizationNumber),
      "project",
    );

    const customer = project?.customer;
    if (!customer?.id) {
      throw new Error("Project customer is missing id");
    }

    const dateCandidates = [
      PROMPT.today,
      ...collectDateCandidates(project),
      ...collectDateCandidates(employee),
    ];
    const workDate = maxIsoDate(...dateCandidates);

    const activities = asArray(
      await request("GET", "activity/>forTimeSheet", {
        query: {
          projectId: project.id,
          employeeId: employee.id,
          date: workDate,
          query: PROMPT.activityName,
          filterExistingHours: false,
          count: 50,
          fields: "*",
        },
      }),
    );
    const activity = requireExact(
      activities,
      (item) => normalizeString((item as any)?.name) === normalizeString(PROMPT.activityName),
      "activity",
    );

    if (activity?.isChargeable === true) {
      const holders = asArray(
        await request("GET", "project/hourlyRates", {
          query: {
            projectId: project.id,
            count: 100,
            fields: "*,projectSpecificRates(*,employee(*),activity(*))",
          },
        }),
      );

      let holder =
        holders.find((item) => Number(item?.project?.id ?? item?.projectId ?? 0) === Number(project.id)) ??
        holders.sort((a, b) => normalizeString(a?.startDate).localeCompare(normalizeString(b?.startDate))).at(-1) ??
        null;
      const existingSpecificRates = asArray(holder?.projectSpecificRates);

      if (!holder) {
        holder = await request("POST", "project/hourlyRates", {
          body: {
            project: { id: project.id },
            startDate: workDate,
            hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
          },
        });
      } else if (holder.hourlyRateModel !== "TYPE_PROJECT_SPECIFIC_HOURLY_RATES") {
        holder = await request("PUT", `project/hourlyRates/${holder.id}`, {
          body: {
            project: { id: project.id },
            startDate: holder.startDate ?? workDate,
            hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
          },
        });
      }

      if (!holder?.id) {
        throw new Error("Project hourly-rate holder is missing id");
      }

      const existingSpecificRate = existingSpecificRates.find(
        (item) =>
          Number(item?.employee?.id ?? 0) === Number(employee.id) &&
          Number(item?.activity?.id ?? 0) === Number(activity.id),
      );

      if (!existingSpecificRate) {
        await request("POST", "project/hourlyRates/projectSpecificRates", {
          body: {
            projectHourlyRate: { id: holder.id },
            employee: { id: employee.id },
            activity: { id: activity.id },
            hourlyRate: PROMPT.hourlyRate,
          },
        });
      } else if (Number(existingSpecificRate.hourlyRate) !== PROMPT.hourlyRate) {
        await request("PUT", `project/hourlyRates/projectSpecificRates/${existingSpecificRate.id}`, {
          body: {
            projectHourlyRate: { id: holder.id },
            employee: { id: employee.id },
            activity: { id: activity.id },
            hourlyRate: PROMPT.hourlyRate,
          },
        });
      }
    }

    const timesheetEntry = await request("POST", "timesheet/entry", {
      body: {
        employee: { id: employee.id },
        project: { id: project.id },
        activity: { id: activity.id },
        date: workDate,
        hours: PROMPT.hours,
        projectChargeableHours: PROMPT.hours,
      },
    });

    if (Number(timesheetEntry?.hours) !== PROMPT.hours || Number(timesheetEntry?.projectChargeableHours) !== PROMPT.hours) {
      throw new Error(`Timesheet entry did not persist expected hours: ${JSON.stringify(timesheetEntry)}`);
    }

    const [vatTypesRaw, bankAccountsRaw] = await Promise.all([
      request("GET", "ledger/vatType", {
        query: {
          typeOfVat: "OUTGOING",
          vatDate: workDate,
          fields: "*",
        },
      }),
      request("GET", "ledger/account", {
        query: {
          isBankAccount: true,
          fields: "*",
        },
      }),
    ]);

    const vatType = chooseOutgoingVatType(asArray(vatTypesRaw));
    const invoiceBankAccount = chooseInvoiceBankAccount(asArray(bankAccountsRaw));
    if (!invoiceBankAccount?.id) {
      throw new Error("Invoice bank account is missing id");
    }

    if (!invoiceBankAccount.bankAccountNumber) {
      await request("PUT", `ledger/account/${invoiceBankAccount.id}`, {
        body: {
          bankAccountNumber: PROMPT.bankAccountNumber,
        },
      });
    }

    const order = await request("POST", "order", {
      body: {
        customer: { id: customer.id },
        project: { id: project.id },
        orderDate: workDate,
        deliveryDate: workDate,
        orderLines: [
          {
            description: PROMPT.activityName,
            count: PROMPT.hours,
            unitPriceExcludingVatCurrency: PROMPT.hourlyRate,
            vatType: { id: vatType.id },
          },
        ],
      },
    });

    if (!order?.id) {
      throw new Error(`Order create response is missing id: ${JSON.stringify(order)}`);
    }

    const invoice = await request("PUT", `order/${order.id}/:invoice`, {
      query: {
        invoiceDate: workDate,
        sendToCustomer: false,
      },
    });

    if (!invoice?.id) {
      throw new Error(`Invoice response is missing id: ${JSON.stringify(invoice)}`);
    }
    if (Number(invoice?.amountExcludingVatCurrency) !== PROMPT.hours * PROMPT.hourlyRate) {
      throw new Error(`Invoice excluding-VAT amount mismatch: ${JSON.stringify(invoice)}`);
    }

    console.log(
      JSON.stringify(
        {
          blocked: false,
          workDate,
          employeeId: employee.id,
          projectId: project.id,
          activityId: activity.id,
          activityIsChargeable: activity?.isChargeable === true,
          timesheetEntryId: timesheetEntry.id,
          orderId: order.id,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber ?? null,
          amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
          amountCurrencyOutstanding: invoice.amountCurrencyOutstanding,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (isInvalidTokenError(error)) {
      console.log(
        JSON.stringify(
          {
            blocked: true,
            reason: "invalid_or_expired_token",
          },
          null,
          2,
        ),
      );
      return;
    }

    if (error instanceof ApiError) {
      console.error(
        JSON.stringify(
          {
            blocked: false,
            error: {
              method: error.method,
              path: error.path,
              status: error.status,
              body: error.bodyJson ?? error.bodyText,
            },
          },
          null,
          2,
        ),
      );
      process.exit(1);
    }

    console.error(
      JSON.stringify(
        {
          blocked: false,
          error: String(error),
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
}

await main();
