const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "qSwedgUB_QepyJ7JJ64Sw-jzCX8Y-gvQq79dlZn3mJ0";

const RUN_DATE = "2026-03-20";
const EMPLOYEE_EMAIL = "laura.muller@example.org";
const CUSTOMER_NAME = "Nordlicht GmbH";
const CUSTOMER_ORG_NO = "936514200";
const PROJECT_NAME = "Datenmigration";
const ACTIVITY_NAME = "Rådgivning";
const HOURS = 20;
const HOURLY_RATE = 1550;

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

type Json = Record<string, any>;

class ApiError extends Error {
  status: number;
  body: any;
  constructor(message: string, status: number, body: any) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function unwrap<T>(data: any): T {
  if (data && typeof data === "object" && "value" in data) return data.value as T;
  return data as T;
}

function listValues<T>(data: any): T[] {
  return Array.isArray(data?.values) ? (data.values as T[]) : [];
}

function exactOne<T>(items: T[], label: string): T {
  if (items.length !== 1) {
    throw new Error(`${label}: expected 1 match, got ${items.length}`);
  }
  return items[0]!;
}

function queryString(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

async function api<T>(method: string, path: string, body?: Json): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const parsed = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const bodyText = typeof parsed === "object" ? JSON.stringify(parsed) : text;
    if (res.status === 403 && bodyText.includes('{"error":"Invalid or expired token"}')) {
      throw new Error("Blocked: invalid or expired token");
    }
    throw new ApiError(`${method} ${path} failed with ${res.status}`, res.status, parsed ?? text);
  }

  return parsed as T;
}

function normalizeOrgNo(value: string | undefined) {
  return (value ?? "").replace(/\s+/g, "");
}

function pickExactBy<T>(items: T[], predicate: (item: T) => boolean, label: string): T {
  return exactOne(items.filter(predicate), label);
}

function toDateValue(value: string | undefined) {
  return value ? new Date(`${value}T00:00:00Z`).getTime() : Number.NEGATIVE_INFINITY;
}

function chooseApplicableHourlyRate(rates: any[]) {
  const applicable = rates
    .filter((rate) => !rate.startDate || rate.startDate <= RUN_DATE)
    .sort((a, b) => toDateValue(b.startDate) - toDateValue(a.startDate));
  if (applicable.length > 0) return applicable[0];
  return rates[0];
}

function chooseVatType(vatTypes: any[]) {
  if (vatTypes.length === 0) throw new Error("No outgoing VAT type available");
  const exact25 = vatTypes.find((vat) => Number(vat?.percentage) === 25);
  return exact25 ?? vatTypes[0];
}

function extractErrorText(error: unknown) {
  if (!(error instanceof ApiError)) return String(error);
  if (typeof error.body === "string") return error.body;
  return JSON.stringify(error.body);
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

async function repairBankAccountAndRetry(orderId: number) {
  const accountsRes = await api<any>(
    "GET",
    `/ledger/account${queryString({ isBankAccount: true, fields: "*", count: 1000 })}`,
  );
  const accounts = listValues<any>(accountsRes);
  if (accounts.length === 0) throw new Error("Bank-account repair failed: no bank accounts found");

  const candidate =
    accounts.find((account) => account.isInvoiceAccount) ??
    accounts.find((account) => account.number === 1920) ??
    accounts[0];
  if (!candidate?.id) throw new Error("Bank-account repair failed: no editable account candidate");

  const existing = new Set(
    accounts
      .map((account) => String(account.bankAccountNumber ?? "").replace(/\s+/g, ""))
      .filter(Boolean),
  );
  const bankAccountNumber = generateNorwegianBankAccountNumber(existing);

  await api<any>("PUT", `/ledger/account/${candidate.id}`, { bankAccountNumber });
  return api<any>(
    "PUT",
    `/order/${orderId}/:invoice${queryString({
      invoiceDate: RUN_DATE,
      sendToCustomer: false,
    })}`,
  );
}

async function main() {
  const employeeRes = await api<any>(
    "GET",
    `/employee${queryString({ email: EMPLOYEE_EMAIL, count: 10, fields: "*" })}`,
  );
  const employee = pickExactBy(
    listValues<any>(employeeRes),
    (item) => (item.email ?? "").toLowerCase() === EMPLOYEE_EMAIL.toLowerCase(),
    "employee",
  );

  const customerRes = await api<any>(
    "GET",
    `/customer${queryString({ organizationNumber: CUSTOMER_ORG_NO, count: 10, fields: "*" })}`,
  );
  const customers = listValues<any>(customerRes).filter(
    (item) => normalizeOrgNo(item.organizationNumber) === CUSTOMER_ORG_NO,
  );
  const customer =
    customers.find((item) => item.name === CUSTOMER_NAME) ??
    exactOne(customers, "customer");

  const projectRes = await api<any>(
    "GET",
    `/project${queryString({ name: PROJECT_NAME, customerId: customer.id, count: 50, fields: "*" })}`,
  );
  const project = pickExactBy(
    listValues<any>(projectRes),
    (item) => item.name === PROJECT_NAME && item.customer?.id === customer.id,
    "project",
  );

  const activityRes = await api<any>(
    "GET",
    `/activity/>forTimeSheet${queryString({
      projectId: project.id,
      employeeId: employee.id,
      date: RUN_DATE,
      query: ACTIVITY_NAME,
      filterExistingHours: false,
      count: 50,
      fields: "*",
    })}`,
  );
  const activity = pickExactBy(
    listValues<any>(activityRes),
    (item) => item.name === ACTIVITY_NAME,
    "activity",
  );
  if (!activity.isChargeable) {
    throw new Error(`Blocked: activity "${ACTIVITY_NAME}" is not chargeable`);
  }

  const hourlyRatesRes = await api<any>(
    "GET",
    `/project/hourlyRates${queryString({ projectId: project.id, count: 100, fields: "*" })}`,
  );
  const hourlyRates = listValues<any>(hourlyRatesRes);
  let projectHourlyRate =
    chooseApplicableHourlyRate(hourlyRates) ??
    unwrap<any>(
      await api<any>("POST", "/project/hourlyRates", {
        project: { id: project.id },
        startDate: RUN_DATE,
        hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
      }),
    );

  if (projectHourlyRate.hourlyRateModel !== "TYPE_PROJECT_SPECIFIC_HOURLY_RATES") {
    projectHourlyRate = unwrap<any>(
      await api<any>("PUT", `/project/hourlyRates/${projectHourlyRate.id}`, {
        project: { id: project.id },
        startDate: projectHourlyRate.startDate ?? RUN_DATE,
        hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
      }),
    );
  }

  const existingSpecificRate = Array.isArray(projectHourlyRate.projectSpecificRates)
    ? projectHourlyRate.projectSpecificRates.find(
        (rate: any) =>
          rate.employee?.id === employee.id &&
          rate.activity?.id === activity.id,
      )
    : undefined;

  let projectSpecificRate: any;
  if (existingSpecificRate?.id && Number(existingSpecificRate.hourlyRate) === HOURLY_RATE) {
    projectSpecificRate = existingSpecificRate;
  } else if (existingSpecificRate?.id) {
    projectSpecificRate = unwrap<any>(
      await api<any>(
        "PUT",
        `/project/hourlyRates/projectSpecificRates/${existingSpecificRate.id}`,
        { hourlyRate: HOURLY_RATE },
      ),
    );
  } else {
    projectSpecificRate = unwrap<any>(
      await api<any>("POST", "/project/hourlyRates/projectSpecificRates", {
        projectHourlyRate: { id: projectHourlyRate.id },
        employee: { id: employee.id },
        activity: { id: activity.id },
        hourlyRate: HOURLY_RATE,
      }),
    );
  }

  const timesheetEntry = unwrap<any>(
    await api<any>("POST", "/timesheet/entry", {
      employee: { id: employee.id },
      project: { id: project.id },
      activity: { id: activity.id },
      date: RUN_DATE,
      hours: HOURS,
      projectChargeableHours: HOURS,
    }),
  );

  if (!timesheetEntry.chargeable || Number(timesheetEntry.hourlyRate) !== HOURLY_RATE) {
    throw new Error(
      `Timesheet verification failed: chargeable=${timesheetEntry.chargeable}, hourlyRate=${timesheetEntry.hourlyRate}`,
    );
  }

  const vatTypeRes = await api<any>(
    "GET",
    `/ledger/vatType${queryString({ typeOfVat: "OUTGOING", vatDate: RUN_DATE, fields: "*" })}`,
  );
  const vatType = chooseVatType(listValues<any>(vatTypeRes));

  const order = unwrap<any>(
    await api<any>("POST", "/order", {
      customer: { id: customer.id },
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
    }),
  );

  let invoice: any;
  try {
    invoice = unwrap<any>(
      await api<any>(
        "PUT",
        `/order/${order.id}/:invoice${queryString({
          invoiceDate: RUN_DATE,
          sendToCustomer: false,
        })}`,
      ),
    );
  } catch (error) {
    const errorText = extractErrorText(error);
    if (
      error instanceof ApiError &&
      error.status === 422 &&
      errorText.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.")
    ) {
      invoice = unwrap<any>(await repairBankAccountAndRetry(order.id));
    } else {
      throw error;
    }
  }

  const result = {
    employeeId: employee.id,
    customerId: customer.id,
    projectId: project.id,
    activityId: activity.id,
    projectHourlyRateId: projectHourlyRate.id,
    projectSpecificRateId: projectSpecificRate?.id,
    timesheetEntryId: timesheetEntry.id,
    timesheetHours: timesheetEntry.hours,
    timesheetChargeable: timesheetEntry.chargeable,
    timesheetHourlyRate: timesheetEntry.hourlyRate,
    orderId: order.id,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceAmountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
    invoiceAmountCurrencyOutstanding: invoice.amountCurrencyOutstanding,
    invoiceCustomerId: invoice.customer?.id,
    invoiceOrderIds: Array.isArray(invoice.orders) ? invoice.orders.map((item: any) => item.id) : [],
  };

  console.log(JSON.stringify(result, null, 2));
}

await main();
