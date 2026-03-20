import { Buffer } from "node:buffer";

const BASE_URL = process.env.TRIPLETEX_BASE_URL;
const TOKEN = process.env.TRIPLETEX_TOKEN;

if (!BASE_URL) throw new Error("Missing TRIPLETEX_BASE_URL");
if (!TOKEN) throw new Error("Missing TRIPLETEX_TOKEN");

const DATE = "2026-03-20";
const HOURS = 11;
const RATE = 1500;
const EMPLOYEE_EMAIL = "sigrid.haugen@example.org";
const PROJECT_NAME = "Nettbutikk-utvikling";
const CUSTOMER_NAME = "Strandvik AS";
const CUSTOMER_ORG = "906155605";
const ACTIVITY_NAME = "Rådgivning";

type Json = Record<string, any>;

class ApiError extends Error {
  status: number;
  body: any;
  method: string;
  path: string;

  constructor(method: string, path: string, status: number, body: any) {
    super(`${method} ${path} failed with ${status}`);
    this.status = status;
    this.body = body;
    this.method = method;
    this.path = path;
  }
}

function authHeader() {
  return `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
}

function buildUrl(path: string, query?: Record<string, any>) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`);
  if (query) {
    for (const [key, raw] of Object.entries(query)) {
      if (raw === undefined || raw === null) continue;
      if (Array.isArray(raw)) {
        for (const value of raw) url.searchParams.append(key, String(value));
      } else {
        url.searchParams.set(key, String(raw));
      }
    }
  }
  return url;
}

async function api<T = any>(method: string, path: string, opts: { query?: Record<string, any>; body?: any } = {}): Promise<T> {
  const url = buildUrl(path, opts.query);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(opts.body !== undefined ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const text = await response.text();
  const body = text ? safeJsonParse(text) : null;

  if (!response.ok) {
    throw new ApiError(method, `${path}${url.search}`, response.status, body ?? text);
  }

  return body as T;
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function expectOne<T>(items: T[], label: string): T {
  if (items.length !== 1) {
    throw new Error(`Expected exactly one ${label}, got ${items.length}`);
  }
  return items[0]!;
}

function norm(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function pickEmployee(values: any[]) {
  return expectOne(values.filter((item) => norm(item.email) === norm(EMPLOYEE_EMAIL)), "employee");
}

function pickProject(values: any[]) {
  return expectOne(
    values.filter(
      (item) =>
        norm(item.name) === norm(PROJECT_NAME) &&
        norm(item.customer?.organizationNumber) === norm(CUSTOMER_ORG) &&
        norm(item.customer?.name) === norm(CUSTOMER_NAME),
    ),
    "project",
  );
}

function pickActivity(values: any[]) {
  return expectOne(
    values.filter((item) => norm(item.name) === norm(ACTIVITY_NAME) || norm(item.displayName) === norm(ACTIVITY_NAME)),
    "activity",
  );
}

function chooseHourlyRateHolder(values: any[]) {
  if (values.length === 0) return null;
  const dated = [...values].sort((a, b) => String(b.startDate ?? "").localeCompare(String(a.startDate ?? "")));
  const applicable = dated.filter((item) => !item.startDate || String(item.startDate) <= DATE);
  return applicable[0] ?? dated[0] ?? null;
}

function findSpecificRate(items: any[] | undefined, employeeId: number, activityId: number) {
  return (items ?? []).find(
    (item) => Number(item.employee?.id) === employeeId && Number(item.activity?.id) === activityId,
  );
}

function isSparseSpecificRate(item: any) {
  return !!item && item.id && (!item.employee || !item.activity);
}

function chooseVatType(values: any[]) {
  const vat25 = values.filter((item) => Number(item.percentage) === 25);
  if (vat25.length > 0) {
    return vat25.find((item) => String(item.number) === "3") ?? vat25[0];
  }

  const percentages = [...new Set(values.map((item) => Number(item.percentage)))];
  if (percentages.length === 1 && values.length > 0) {
    return values[0];
  }

  const vat0 = values.filter((item) => Number(item.percentage) === 0);
  if (vat0.length > 0 && vat0.length === values.length) {
    return vat0.find((item) => String(item.number) === "6" || String(item.number) === "5") ?? vat0[0];
  }

  throw new Error(`Could not choose unambiguous outgoing VAT type from ${JSON.stringify(values)}`);
}

function pickInvoiceBankAccount(values: any[]) {
  const preferred = values.find((item) => item.isInvoiceAccount);
  return preferred ?? values[0] ?? null;
}

function generateValidBankAccountNumber() {
  const seed = Number(String(Date.now()).slice(-10));
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

  for (let offset = 0; offset < 1000; offset++) {
    const base = String(seed + offset).padStart(10, "1").slice(-10);
    const digits = base.split("").map(Number);

    let sum = 0;
    for (let i = 0; i < 10; i++) sum += digits[i]! * weights[i]!;

    const remainder = sum % 11;
    let checkDigit = 11 - remainder;
    if (checkDigit === 11) checkDigit = 0;
    if (checkDigit === 10) continue;

    return `${digits.join("")}${checkDigit}`;
  }

  throw new Error("Could not generate valid bank account number");
}

function extractValidationMessages(body: any) {
  const messages = body?.validationMessages;
  if (Array.isArray(messages)) return messages.map((item) => item.message ?? JSON.stringify(item)).join(" | ");
  return JSON.stringify(body);
}

async function ensureInvoiceBankAccount() {
  const bankAccountsResp = await api<Json>("GET", "/ledger/account", {
    query: { isBankAccount: true, fields: "*" },
  });
  const account = pickInvoiceBankAccount(bankAccountsResp.values ?? []);
  if (!account) {
    throw new Error("No bank account available for invoice repair");
  }

  if (account.bankAccountNumber) return account;

  const updateResp = await api<Json>("PUT", `/ledger/account/${account.id}`, {
    body: { bankAccountNumber: generateValidBankAccountNumber() },
  });
  return updateResp.value;
}

async function invoiceOrder(orderId: number) {
  return api<Json>("PUT", `/order/${orderId}/:invoice`, {
    query: { invoiceDate: DATE, sendToCustomer: false },
  });
}

async function main() {
  const employeeResp = await api<Json>("GET", "/employee", {
    query: { email: EMPLOYEE_EMAIL, count: 10, fields: "*" },
  });
  const employee = pickEmployee(employeeResp.values ?? []);

  const projectResp = await api<Json>("GET", "/project", {
    query: { name: PROJECT_NAME, count: 50, fields: "*,customer(*)" },
  });
  const project = pickProject(projectResp.values ?? []);

  const activityResp = await api<Json>("GET", "/activity/>forTimeSheet", {
    query: {
      projectId: project.id,
      employeeId: employee.id,
      date: DATE,
      query: ACTIVITY_NAME,
      filterExistingHours: false,
      count: 50,
      fields: "*",
    },
  });
  const activity = pickActivity(activityResp.values ?? []);

  let specificRate: any = null;

  if (activity.isChargeable) {
    const holderResp = await api<Json>("GET", "/project/hourlyRates", {
      query: {
        projectId: project.id,
        count: 100,
        fields: "*,projectSpecificRates(*,employee(*),activity(*))",
      },
    });

    let holder = chooseHourlyRateHolder(holderResp.values ?? []);

    if (!holder) {
      const createHolderResp = await api<Json>("POST", "/project/hourlyRates", {
        body: {
          project: { id: project.id },
          startDate: DATE,
          hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
        },
      });
      holder = createHolderResp.value;
    } else if (holder.hourlyRateModel !== "TYPE_PROJECT_SPECIFIC_HOURLY_RATES") {
      const switchHolderResp = await api<Json>("PUT", `/project/hourlyRates/${holder.id}`, {
        body: {
          project: { id: project.id },
          startDate: holder.startDate ?? DATE,
          hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
        },
      });
      holder = switchHolderResp.value;
    }

    specificRate = findSpecificRate(holder.projectSpecificRates, employee.id, activity.id);

    if (!specificRate && (holder.projectSpecificRates ?? []).some(isSparseSpecificRate)) {
      const specificRatesResp = await api<Json>("GET", "/project/hourlyRates/projectSpecificRates", {
        query: {
          projectHourlyRateId: holder.id,
          employeeId: employee.id,
          activityId: activity.id,
          count: 10,
          fields: "*",
        },
      });
      const matchingSpecificRates = (specificRatesResp.values ?? []).filter(
        (item: any) => Number(item.employee?.id) === Number(employee.id) && Number(item.activity?.id) === Number(activity.id),
      );
      if (matchingSpecificRates.length > 1) {
        throw new Error(`Expected at most one project specific rate, got ${matchingSpecificRates.length}`);
      }
      specificRate = matchingSpecificRates[0] ?? null;
    }

    if (!specificRate) {
      const createSpecificRateResp = await api<Json>("POST", "/project/hourlyRates/projectSpecificRates", {
        body: {
          projectHourlyRate: { id: holder.id },
          employee: { id: employee.id },
          activity: { id: activity.id },
          hourlyRate: RATE,
        },
      });
      specificRate = createSpecificRateResp.value;
    } else if (Number(specificRate.hourlyRate) !== RATE) {
      const updateSpecificRateResp = await api<Json>("PUT", `/project/hourlyRates/projectSpecificRates/${specificRate.id}`, {
        body: {
          projectHourlyRate: { id: holder.id },
          employee: { id: employee.id },
          activity: { id: activity.id },
          hourlyRate: RATE,
        },
      });
      specificRate = updateSpecificRateResp.value;
    }
  }

  const timesheetResp = await api<Json>("POST", "/timesheet/entry", {
    body: {
      employee: { id: employee.id },
      project: { id: project.id },
      activity: { id: activity.id },
      date: DATE,
      hours: HOURS,
      projectChargeableHours: HOURS,
    },
  });
  const timesheet = timesheetResp.value;

  const vatResp = await api<Json>("GET", "/ledger/vatType", {
    query: { typeOfVat: "OUTGOING", vatDate: DATE, fields: "*" },
  });
  const vatType = chooseVatType(vatResp.values ?? []);

  const orderResp = await api<Json>("POST", "/order", {
    body: {
      customer: { id: project.customer.id },
      project: { id: project.id },
      orderDate: DATE,
      deliveryDate: DATE,
      orderLines: [
        {
          description: ACTIVITY_NAME,
          count: HOURS,
          unitPriceExcludingVatCurrency: RATE,
          vatType: { id: vatType.id },
        },
      ],
    },
  });
  const order = orderResp.value;

  await ensureInvoiceBankAccount();

  let invoiceResp: Json;
  try {
    invoiceResp = await invoiceOrder(order.id);
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 422 &&
      extractValidationMessages(error.body).includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.")
    ) {
      await ensureInvoiceBankAccount();
      invoiceResp = await invoiceOrder(order.id);
    } else {
      throw error;
    }
  }

  const invoice = invoiceResp.value;

  const result = {
    employeeId: employee.id,
    projectId: project.id,
    activityId: activity.id,
    specificRateId: specificRate?.id ?? null,
    timesheetEntryId: timesheet.id,
    timesheetHours: timesheet.hours,
    timesheetProjectChargeableHours: timesheet.projectChargeableHours,
    timesheetChargeable: timesheet.chargeable,
    timesheetHourlyRate: timesheet.hourlyRate,
    orderId: order.id,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber ?? invoice.number ?? null,
    amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
    amountCurrencyOutstanding: invoice.amountCurrencyOutstanding,
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  if (error instanceof ApiError) {
    console.error(JSON.stringify({ method: error.method, path: error.path, status: error.status, body: error.body }, null, 2));
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});
