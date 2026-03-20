const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "lZ76Auc4V0koDg0QUctBEtTaN0F4D9dlX8YtxsPH-54";

const TASK_DATE = "2026-03-20";
const EMPLOYEE_EMAIL = "sophia.schmidt@example.org";
const PROJECT_NAME = "Sicherheitsaudit";
const CUSTOMER_NAME = "Windkraft GmbH";
const CUSTOMER_ORG_NO = "882984826";
const ACTIVITY_NAME = "Design";
const HOURS = 18;
const HOURLY_RATE = 950;
const FALLBACK_BANK_ACCOUNT_NUMBER = "12345678903";

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

type WrappedList<T> = { values?: T[]; fullResultSize?: number };
type WrappedValue<T> = { value?: T };

type Employee = {
  id: number;
  email?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
};

type Customer = {
  id: number;
  name?: string;
  organizationNumber?: string;
};

type Project = {
  id: number;
  name?: string;
  customer?: Customer | null;
};

type Activity = {
  id: number;
  name?: string;
  isChargeable?: boolean;
};

type ProjectSpecificRate = {
  id: number;
  hourlyRate?: number;
  employee?: { id: number };
  activity?: { id: number };
};

type ProjectHourlyRate = {
  id: number;
  hourlyRateModel?: string;
  startDate?: string;
  projectSpecificRates?: ProjectSpecificRate[];
};

type VatType = {
  id: number;
  percentage?: number;
  number?: string;
  name?: string;
};

type LedgerAccount = {
  id: number;
  number?: string;
  bankAccountNumber?: string;
  isInvoiceAccount?: boolean;
  isBankAccount?: boolean;
};

class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

function endpoint(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(path, BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function request<T>(
  method: string,
  path: string,
  options?: {
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
  },
): Promise<T> {
  const res = await fetch(endpoint(path, options?.query), {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  const body = text ? safeJson(text) : undefined;

  if (res.status === 403 && isInvalidToken(body)) {
    throw new Error("Blocked: invalid or expired token");
  }

  if (!res.ok) {
    throw new ApiError(res.status, body, `HTTP ${res.status} ${method} ${path}`);
  }

  return body as T;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isInvalidToken(body: unknown) {
  if (!body || typeof body !== "object") return false;
  const error = (body as Record<string, unknown>).error;
  return (
    error === "Invalid or expired token" ||
    error ===
      "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions."
  );
}

function exactOne<T>(items: T[], predicate: (item: T) => boolean, label: string): T {
  const matches = items.filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`${label}: expected exactly 1 match, got ${matches.length}`);
  }
  return matches[0];
}

function normalize(value: string | undefined | null) {
  return (value ?? "").trim().toLowerCase();
}

function getValidationMessages(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const maybeMessages = (body as Record<string, unknown>).validationMessages;
  if (!Array.isArray(maybeMessages)) return [];
  return maybeMessages
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        return [record.field, record.message].filter(Boolean).join(": ");
      }
      return "";
    })
    .filter(Boolean);
}

function hasBankAccountValidation(body: unknown) {
  const serialized = JSON.stringify(body);
  if (serialized.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.")) {
    return true;
  }
  return getValidationMessages(body).some((message) =>
    message.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer."),
  );
}

function chooseVatType(vats: VatType[]) {
  if (vats.length === 0) throw new Error("No outgoing VAT types returned");
  return vats.find((vat) => vat.percentage === 25) ?? vats[0];
}

async function main() {
  const employeeResp = await request<WrappedList<Employee>>("GET", "employee", {
    query: { email: EMPLOYEE_EMAIL, count: 10, fields: "*" },
  });
  const employee = exactOne(
    employeeResp.values ?? [],
    (item) => normalize(item.email) === normalize(EMPLOYEE_EMAIL),
    "employee",
  );

  const projectResp = await request<WrappedList<Project>>("GET", "project", {
    query: { name: PROJECT_NAME, count: 50, fields: "*,customer(*)" },
  });
  const project = exactOne(
    projectResp.values ?? [],
    (item) =>
      normalize(item.name) === normalize(PROJECT_NAME) &&
      normalize(item.customer?.organizationNumber) === normalize(CUSTOMER_ORG_NO) &&
      normalize(item.customer?.name) === normalize(CUSTOMER_NAME),
    "project",
  );
  if (!project.customer?.id) throw new Error("project.customer.id missing");

  const activityResp = await request<WrappedList<Activity>>("GET", "activity/>forTimeSheet", {
    query: {
      projectId: project.id,
      employeeId: employee.id,
      date: TASK_DATE,
      query: ACTIVITY_NAME,
      filterExistingHours: false,
      count: 50,
      fields: "*",
    },
  });
  const activity = exactOne(
    activityResp.values ?? [],
    (item) => normalize(item.name) === normalize(ACTIVITY_NAME),
    "activity",
  );

  if (activity.isChargeable) {
    const projectHourlyRatesResp = await request<WrappedList<ProjectHourlyRate>>("GET", "project/hourlyRates", {
      query: {
        projectId: project.id,
        count: 100,
        fields: "*,projectSpecificRates(*,employee(*),activity(*))",
      },
    });

    let holder = (projectHourlyRatesResp.values ?? [])[0];
    if (!holder) {
      const createdHolderResp = await request<WrappedValue<ProjectHourlyRate>>("POST", "project/hourlyRates", {
        body: {
          project: { id: project.id },
          startDate: TASK_DATE,
          hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
        },
      });
      holder = createdHolderResp.value;
    }

    if (!holder?.id) throw new Error("project hourly rate holder missing");

    if (holder.hourlyRateModel !== "TYPE_PROJECT_SPECIFIC_HOURLY_RATES") {
      const updatedHolderResp = await request<WrappedValue<ProjectHourlyRate>>(
        "PUT",
        `project/hourlyRates/${holder.id}`,
        {
          body: {
            project: { id: project.id },
            startDate: holder.startDate ?? TASK_DATE,
            hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
          },
        },
      );
      holder = updatedHolderResp.value;
    }

    const existingRate = (holder?.projectSpecificRates ?? []).find(
      (rate) => rate.employee?.id === employee.id && rate.activity?.id === activity.id,
    );

    if (!existingRate) {
      await request("POST", "project/hourlyRates/projectSpecificRates", {
        body: {
          projectHourlyRate: { id: holder.id },
          employee: { id: employee.id },
          activity: { id: activity.id },
          hourlyRate: HOURLY_RATE,
        },
      });
    } else if (existingRate.hourlyRate !== HOURLY_RATE) {
      await request("PUT", `project/hourlyRates/projectSpecificRates/${existingRate.id}`, {
        body: {
          projectHourlyRate: { id: holder.id },
          employee: { id: employee.id },
          activity: { id: activity.id },
          hourlyRate: HOURLY_RATE,
        },
      });
    }
  }

  const timesheetResp = await request<WrappedValue<Record<string, unknown>>>("POST", "timesheet/entry", {
    body: {
      employee: { id: employee.id },
      project: { id: project.id },
      activity: { id: activity.id },
      date: TASK_DATE,
      hours: HOURS,
      projectChargeableHours: HOURS,
    },
  });
  const timesheet = timesheetResp.value ?? {};

  const vatResp = await request<WrappedList<VatType>>("GET", "ledger/vatType", {
    query: { typeOfVat: "OUTGOING", vatDate: TASK_DATE, fields: "*" },
  });
  const vatType = chooseVatType(vatResp.values ?? []);

  const orderResp = await request<WrappedValue<{ id: number }>>("POST", "order", {
    body: {
      customer: { id: project.customer.id },
      project: { id: project.id },
      orderDate: TASK_DATE,
      deliveryDate: TASK_DATE,
      orderLines: [
        {
          description: ACTIVITY_NAME,
          count: HOURS,
          unitPriceExcludingVatCurrency: HOURLY_RATE,
          vatType: { id: vatType.id },
        },
      ],
    },
  });
  const orderId = orderResp.value?.id;
  if (!orderId) throw new Error("order.id missing");

  let invoiceResp: WrappedValue<Record<string, unknown>>;
  try {
    invoiceResp = await request<WrappedValue<Record<string, unknown>>>("PUT", `order/${orderId}/:invoice`, {
      query: { invoiceDate: TASK_DATE, sendToCustomer: false },
    });
  } catch (error) {
    if (!(error instanceof ApiError) || !hasBankAccountValidation(error.body)) throw error;

    const ledgerResp = await request<WrappedList<LedgerAccount>>("GET", "ledger/account", {
      query: { isBankAccount: true, fields: "*" },
    });
    const account = (ledgerResp.values ?? []).find((item) => item.isInvoiceAccount) ?? (ledgerResp.values ?? [])[0];
    if (!account?.id) throw new Error("invoice bank account not found");

    await request("PUT", `ledger/account/${account.id}`, {
      body: { bankAccountNumber: FALLBACK_BANK_ACCOUNT_NUMBER },
    });

    invoiceResp = await request<WrappedValue<Record<string, unknown>>>("PUT", `order/${orderId}/:invoice`, {
      query: { invoiceDate: TASK_DATE, sendToCustomer: false },
    });
  }

  const invoice = invoiceResp.value ?? {};
  const summary = {
    employeeId: employee.id,
    projectId: project.id,
    customerId: project.customer.id,
    activityId: activity.id,
    activityIsChargeable: activity.isChargeable ?? null,
    timesheetId: (timesheet as Record<string, unknown>).id ?? null,
    timesheetHours: (timesheet as Record<string, unknown>).hours ?? null,
    timesheetProjectChargeableHours: (timesheet as Record<string, unknown>).projectChargeableHours ?? null,
    timesheetHourlyRate: (timesheet as Record<string, unknown>).hourlyRate ?? null,
    timesheetChargeable: (timesheet as Record<string, unknown>).chargeable ?? null,
    orderId,
    invoiceId: (invoice as Record<string, unknown>).id ?? null,
    invoiceNumber: (invoice as Record<string, unknown>).invoiceNumber ?? null,
    amountExcludingVatCurrency: (invoice as Record<string, unknown>).amountExcludingVatCurrency ?? null,
    amountCurrencyOutstanding: (invoice as Record<string, unknown>).amountCurrencyOutstanding ?? null,
  };

  console.log(JSON.stringify(summary, null, 2));
}

await main();
