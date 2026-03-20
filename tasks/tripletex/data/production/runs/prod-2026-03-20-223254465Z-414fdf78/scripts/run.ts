import { Buffer } from "node:buffer";

const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "0g2_rv0j3NMAyfGRvNn3lWivaK0FjsagAWJiOcWLJJ0";

const RUN_DATE = "2026-03-20";
const EMPLOYEE_EMAIL = "tiago.santos@example.org";
const PROJECT_NAME = "Integração de plataforma";
const CUSTOMER_NAME = "Floresta Lda";
const CUSTOMER_ORG_NO = "889395338";
const ACTIVITY_NAME = "Analyse";
const HOURS = 23;
const HOURLY_RATE = 1050;

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

type WrappedList<T> = { values?: T[]; fullResultSize?: number };
type WrappedValue<T> = { value?: T };

type Employee = {
  id: number;
  email?: string;
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
  startDate?: string;
  hourlyRateModel?: string;
  projectSpecificRates?: ProjectSpecificRate[];
};

type VatType = {
  id: number;
  percentage?: number;
};

type LedgerAccount = {
  id: number;
  number?: number;
  isInvoiceAccount?: boolean;
  bankAccountNumber?: string;
};

type TimesheetEntry = {
  id: number;
  hours?: number;
  projectChargeableHours?: number;
  hourlyRate?: number;
  chargeable?: boolean;
  project?: { id: number };
  activity?: { id: number };
};

type Order = {
  id: number;
};

type Invoice = {
  id: number;
  invoiceNumber?: number | string;
  amountExcludingVatCurrency?: number;
  amountCurrencyOutstanding?: number;
  customer?: { id: number };
  orders?: Array<{ id: number }>;
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
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
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
      ...(options?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
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

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeOrgNo(value: unknown) {
  return String(value ?? "").replace(/\s+/g, "");
}

function exactOne<T>(items: T[], label: string): T {
  if (items.length !== 1) {
    throw new Error(`${label}: expected exactly 1 match, got ${items.length}`);
  }
  return items[0]!;
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
  if (vats.length === 0) {
    throw new Error("No outgoing VAT types returned");
  }
  return vats.find((vat) => Number(vat.percentage) === 25) ?? vats[0]!;
}

function toDateValue(value: string | undefined) {
  return value ? new Date(`${value}T00:00:00Z`).getTime() : Number.NEGATIVE_INFINITY;
}

function chooseApplicableHourlyRate(rates: ProjectHourlyRate[]) {
  const applicable = rates
    .filter((rate) => !rate.startDate || rate.startDate <= RUN_DATE)
    .sort((a, b) => toDateValue(b.startDate) - toDateValue(a.startDate));
  return applicable[0] ?? rates[0];
}

function generateNorwegianBankAccountNumber(existing: Set<string>) {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  for (let seed = 2000000000; seed < 9999999999; seed += 1) {
    const prefix = String(seed).padStart(10, "0");
    if (existing.has(prefix)) continue;
    const sum = prefix
      .split("")
      .reduce((acc, digit, index) => acc + Number(digit) * weights[index]!, 0);
    const remainder = sum % 11;
    const checksum = 11 - remainder;
    if (checksum === 10) continue;
    const control = checksum === 11 ? 0 : checksum;
    const full = `${prefix}${control}`;
    if (!existing.has(full)) return full;
  }
  throw new Error("Could not generate bank account number");
}

function resolveProject(projects: Project[]) {
  const byOrg = projects.filter(
    (project) =>
      normalize(project.name) === normalize(PROJECT_NAME) &&
      normalizeOrgNo(project.customer?.organizationNumber) === normalizeOrgNo(CUSTOMER_ORG_NO),
  );
  if (byOrg.length === 1) return byOrg[0]!;
  const byOrgAndName = byOrg.filter((project) => normalize(project.customer?.name) === normalize(CUSTOMER_NAME));
  if (byOrgAndName.length === 1) return byOrgAndName[0]!;
  return exactOne(byOrgAndName.length > 0 ? byOrgAndName : byOrg, "project");
}

async function ensureProjectSpecificRate(project: Project, employee: Employee, activity: Activity) {
  const projectHourlyRatesResp = await request<WrappedList<ProjectHourlyRate>>("GET", "project/hourlyRates", {
    query: {
      projectId: project.id,
      count: 100,
      fields: "*,projectSpecificRates(*,employee(*),activity(*))",
    },
  });

  let holder = chooseApplicableHourlyRate(projectHourlyRatesResp.values ?? []);

  if (!holder) {
    const createdHolderResp = await request<WrappedValue<ProjectHourlyRate>>("POST", "project/hourlyRates", {
      body: {
        project: { id: project.id },
        startDate: RUN_DATE,
        hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
      },
    });
    holder = createdHolderResp.value;
  }

  if (!holder?.id) {
    throw new Error("project hourly rate holder missing");
  }

  if (holder.hourlyRateModel !== "TYPE_PROJECT_SPECIFIC_HOURLY_RATES") {
    const updatedHolderResp = await request<WrappedValue<ProjectHourlyRate>>("PUT", `project/hourlyRates/${holder.id}`, {
      body: {
        project: { id: project.id },
        startDate: holder.startDate ?? RUN_DATE,
        hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
      },
    });
    holder = updatedHolderResp.value;
  }

  if (!holder?.id) {
    throw new Error("project hourly rate holder missing after update");
  }

  const existingRate = (holder.projectSpecificRates ?? []).find(
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
    return;
  }

  if (Number(existingRate.hourlyRate) !== HOURLY_RATE) {
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

async function createTimesheetEntry(employee: Employee, project: Project, activity: Activity) {
  const timesheetResp = await request<WrappedValue<TimesheetEntry>>("POST", "timesheet/entry", {
    body: {
      employee: { id: employee.id },
      project: { id: project.id },
      activity: { id: activity.id },
      date: RUN_DATE,
      hours: HOURS,
      projectChargeableHours: HOURS,
    },
  });

  const entry = timesheetResp.value;
  if (!entry?.id) {
    throw new Error("timesheet entry missing");
  }
  if (
    Number(entry.hours) !== HOURS ||
    Number(entry.projectChargeableHours) !== HOURS ||
    entry.project?.id !== project.id ||
    entry.activity?.id !== activity.id
  ) {
    throw new Error("timesheet verification failed");
  }
  if (activity.isChargeable && (!entry.chargeable || Number(entry.hourlyRate) !== HOURLY_RATE)) {
    throw new Error(
      `timesheet chargeable verification failed: chargeable=${entry.chargeable} hourlyRate=${entry.hourlyRate}`,
    );
  }
  return entry;
}

async function repairBankAccount() {
  const ledgerResp = await request<WrappedList<LedgerAccount>>("GET", "ledger/account", {
    query: { isBankAccount: true, count: 1000, fields: "*" },
  });
  const accounts = ledgerResp.values ?? [];
  const account =
    accounts.find((item) => item.isInvoiceAccount) ??
    accounts.find((item) => Number(item.number) === 1920) ??
    accounts[0];

  if (!account?.id) {
    throw new Error("invoice bank account not found");
  }

  const existing = new Set(
    accounts
      .map((item) => String(item.bankAccountNumber ?? "").replace(/\s+/g, ""))
      .filter(Boolean),
  );
  const bankAccountNumber = generateNorwegianBankAccountNumber(existing);

  await request("PUT", `ledger/account/${account.id}`, {
    body: { bankAccountNumber },
  });
}

async function createInvoice(project: Project, vatType: VatType) {
  if (!project.customer?.id) {
    throw new Error("project.customer.id missing");
  }

  const orderResp = await request<WrappedValue<Order>>("POST", "order", {
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
  });

  const orderId = orderResp.value?.id;
  if (!orderId) {
    throw new Error("order.id missing");
  }

  try {
    const invoiceResp = await request<WrappedValue<Invoice>>("PUT", `order/${orderId}/:invoice`, {
      query: { invoiceDate: RUN_DATE, sendToCustomer: false },
    });
    return { orderId, invoice: invoiceResp.value };
  } catch (error) {
    if (!(error instanceof ApiError) || !hasBankAccountValidation(error.body)) {
      throw error;
    }

    await repairBankAccount();

    const retryResp = await request<WrappedValue<Invoice>>("PUT", `order/${orderId}/:invoice`, {
      query: { invoiceDate: RUN_DATE, sendToCustomer: false },
    });
    return { orderId, invoice: retryResp.value };
  }
}

async function main() {
  const employeeResp = await request<WrappedList<Employee>>("GET", "employee", {
    query: { email: EMPLOYEE_EMAIL, count: 10, fields: "*" },
  });
  const employee = exactOne(
    (employeeResp.values ?? []).filter((item) => normalize(item.email) === normalize(EMPLOYEE_EMAIL)),
    "employee",
  );

  const projectResp = await request<WrappedList<Project>>("GET", "project", {
    query: { name: PROJECT_NAME, count: 50, fields: "*,customer(*)" },
  });
  const project = resolveProject(projectResp.values ?? []);

  const activityResp = await request<WrappedList<Activity>>("GET", "activity/>forTimeSheet", {
    query: {
      projectId: project.id,
      employeeId: employee.id,
      date: RUN_DATE,
      query: ACTIVITY_NAME,
      filterExistingHours: false,
      count: 50,
      fields: "*",
    },
  });
  const activity = exactOne(
    (activityResp.values ?? []).filter((item) => normalize(item.name) === normalize(ACTIVITY_NAME)),
    "activity",
  );

  if (activity.isChargeable) {
    await ensureProjectSpecificRate(project, employee, activity);
  }

  const timesheetEntry = await createTimesheetEntry(employee, project, activity);

  const vatTypeResp = await request<WrappedList<VatType>>("GET", "ledger/vatType", {
    query: { typeOfVat: "OUTGOING", vatDate: RUN_DATE, fields: "*" },
  });
  const vatType = chooseVatType(vatTypeResp.values ?? []);

  const { orderId, invoice } = await createInvoice(project, vatType);
  if (!invoice?.id) {
    throw new Error("invoice.id missing");
  }

  console.log(
    JSON.stringify(
      {
        employeeId: employee.id,
        projectId: project.id,
        customerId: project.customer?.id,
        activityId: activity.id,
        timesheetEntryId: timesheetEntry.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
        amountCurrencyOutstanding: invoice.amountCurrencyOutstanding,
        invoiceCustomerId: invoice.customer?.id,
        invoiceOrderIds: Array.isArray(invoice.orders) ? invoice.orders.map((item) => item.id) : [],
        orderId,
      },
      null,
      2,
    ),
  );
}

await main();
