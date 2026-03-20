import { Buffer } from "node:buffer";

const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2/";
const TOKEN = "zeTFYe78yrdw6HDZbUOZb3OMJEk961tkbyDgSQ6Xq3s";
const DATE = "2026-03-20";

const EMPLOYEE_EMAIL = "diego.sanchez@example.org";
const PROJECT_NAME = "Desarrollo de app";
const CUSTOMER_ORG = "980551709";
const CUSTOMER_NAME = "Olivares SL";
const ACTIVITY_NAME = "Analyse";
const HOURS = 39;
const RATE = 1450;
const BANK_ACCOUNT_NUMBER = "12345678903";

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

type Wrapper<T> = { value?: T; values?: T[]; [key: string]: unknown };

class ApiError extends Error {
  status: number;
  body: unknown;
  path: string;

  constructor(status: number, path: string, body: unknown) {
    super(`Tripletex API error ${status} on ${path}`);
    this.status = status;
    this.path = path;
    this.body = body;
  }
}

function authHeader() {
  return `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
}

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(path, BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

function unwrapList<T>(payload: Wrapper<T>): T[] {
  return Array.isArray(payload.values) ? payload.values : [];
}

function unwrapValue<T>(payload: Wrapper<T>): T {
  if (!payload.value) {
    throw new Error("Missing value wrapper");
  }
  return payload.value;
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function getMessage(body: unknown): string {
  if (!body || typeof body !== "object") {
    return "";
  }
  const record = body as Record<string, unknown>;
  const top = typeof record.error === "string" ? record.error : typeof record.message === "string" ? record.message : "";
  const validationMessages = Array.isArray(record.validationMessages)
    ? record.validationMessages
        .map((item) => {
          if (!item || typeof item !== "object") {
            return "";
          }
          const entry = item as Record<string, unknown>;
          return typeof entry.message === "string" ? entry.message : "";
        })
        .filter(Boolean)
        .join(" | ")
    : "";
  return [top, validationMessages].filter(Boolean).join(" | ");
}

async function api<T>(method: string, path: string, opts?: {
  query?: Record<string, string | number | boolean | undefined>;
  body?: Json;
}): Promise<T> {
  const response = await fetch(buildUrl(path, opts?.query), {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(opts?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = getMessage(parsed);
    if (
      response.status === 403 &&
      (
        message.includes("Invalid or expired token") ||
        message.includes("Invalid or expired proxy token")
      )
    ) {
      throw new Error(`Blocked credentials: ${message}`);
    }
    throw new ApiError(response.status, path, parsed);
  }

  return parsed as T;
}

function requireOne<T>(items: T[], label: string): T {
  if (items.length !== 1) {
    throw new Error(`${label}: expected 1, got ${items.length}`);
  }
  return items[0];
}

function matchesOrg(customer: any) {
  return normalize(customer?.organizationNumber) === normalize(CUSTOMER_ORG);
}

function chooseVatType(vatTypes: any[]) {
  const with25 = vatTypes.find((vatType) => Number(vatType?.percentage) === 25);
  return with25 ?? requireOne(vatTypes, "vatType");
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function splitHours(total: number) {
  const chunks: { date: string; hours: number }[] = [];
  let remaining = total;
  let offset = 0;
  while (remaining > 0) {
    const hours = Math.min(24, remaining);
    chunks.push({ date: addDays(DATE, -offset), hours });
    offset += 1;
    remaining -= hours;
  }
  return chunks;
}

async function repairBankAccount() {
  const accountsPayload = await api<Wrapper<any>>("GET", "ledger/account", {
    query: { isBankAccount: true, fields: "*" },
  });
  const accounts = unwrapList(accountsPayload);
  const account =
    accounts.find((item) => item?.isInvoiceAccount === true) ??
    accounts.find((item) => Number(item?.number) === 1920) ??
    requireOne(accounts, "bank account");

  await api("PUT", `ledger/account/${account.id}`, {
    body: { bankAccountNumber: BANK_ACCOUNT_NUMBER },
  });
}

async function invoiceOrder(orderId: number | string) {
  try {
    return await api<Wrapper<any>>("PUT", `order/${orderId}/:invoice`, {
      query: { invoiceDate: DATE, sendToCustomer: false },
    });
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    const message = getMessage(error.body);
    if (!message.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.")) {
      throw error;
    }
    await repairBankAccount();
    return await api<Wrapper<any>>("PUT", `order/${orderId}/:invoice`, {
      query: { invoiceDate: DATE, sendToCustomer: false },
    });
  }
}

async function main() {
  const employeePayload = await api<Wrapper<any>>("GET", "employee", {
    query: { email: EMPLOYEE_EMAIL, count: 10, fields: "*" },
  });
  const employee = requireOne(
    unwrapList(employeePayload).filter((item) => normalize(item?.email) === normalize(EMPLOYEE_EMAIL)),
    "employee",
  );

  const projectPayload = await api<Wrapper<any>>("GET", "project", {
    query: { name: PROJECT_NAME, count: 50, fields: "*,customer(*)" },
  });
  const project = requireOne(
    unwrapList(projectPayload).filter(
      (item) =>
        normalize(item?.name) === normalize(PROJECT_NAME) &&
        matchesOrg(item?.customer) &&
        normalize(item?.customer?.name) === normalize(CUSTOMER_NAME),
    ),
    "project",
  );

  const activityPayload = await api<Wrapper<any>>("GET", "activity/>forTimeSheet", {
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
  const activities = unwrapList(activityPayload);
  const activity =
    activities.find((item) => normalize(item?.name) === normalize(ACTIVITY_NAME)) ??
    activities.find((item) => normalize(item?.description) === normalize(ACTIVITY_NAME)) ??
    requireOne(activities, "activity");

  if (activity?.chargeable === true) {
    const holderPayload = await api<Wrapper<any>>("GET", "project/hourlyRates", {
      query: {
        projectId: project.id,
        count: 100,
        fields: "*,projectSpecificRates(*,employee(*),activity(*))",
      },
    });
    const holders = unwrapList(holderPayload).filter((item) => Number(item?.project?.id) === Number(project.id));
    let holder = holders[0];

    if (!holder) {
      const createdHolderPayload = await api<Wrapper<any>>("POST", "project/hourlyRates", {
        body: {
          project: { id: project.id },
          startDate: DATE,
          hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
        },
      });
      holder = unwrapValue(createdHolderPayload);
    } else if (holder.hourlyRateModel !== "TYPE_PROJECT_SPECIFIC_HOURLY_RATES") {
      const switchedHolderPayload = await api<Wrapper<any>>("PUT", `project/hourlyRates/${holder.id}`, {
        body: {
          project: { id: project.id },
          startDate: holder.startDate ?? DATE,
          hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
        },
      });
      holder = unwrapValue(switchedHolderPayload);
    }

    const specificRates = Array.isArray(holder?.projectSpecificRates) ? holder.projectSpecificRates : [];
    const existingRate = specificRates.find(
      (item: any) =>
        Number(item?.employee?.id) === Number(employee.id) &&
        Number(item?.activity?.id) === Number(activity.id),
    );

    if (!existingRate) {
      await api("POST", "project/hourlyRates/projectSpecificRates", {
        body: {
          projectHourlyRate: { id: holder.id },
          employee: { id: employee.id },
          activity: { id: activity.id },
          hourlyRate: RATE,
        },
      });
    } else if (Number(existingRate.hourlyRate) !== RATE) {
      await api("PUT", `project/hourlyRates/projectSpecificRates/${existingRate.id}`, {
        body: {
          projectHourlyRate: { id: holder.id },
          employee: { id: employee.id },
          activity: { id: activity.id },
          hourlyRate: RATE,
        },
      });
    }
  }

  const desiredTimesheets = splitHours(HOURS);
  const earliestDate = desiredTimesheets[desiredTimesheets.length - 1]?.date ?? DATE;
  const existingTimesheetPayload = await api<Wrapper<any>>("GET", "timesheet/entry", {
    query: {
      employeeId: employee.id,
      projectId: project.id,
      activityId: activity.id,
      dateFrom: earliestDate,
      dateTo: addDays(DATE, 1),
      count: 100,
      fields: "*",
    },
  });
  const existingTimesheets = unwrapList(existingTimesheetPayload);

  const timesheets: any[] = [];
  for (const desired of desiredTimesheets) {
    const existing = existingTimesheets.find((entry) => normalize(entry?.date) === normalize(desired.date));
    if (existing) {
      if (
        Number(existing?.hours) !== desired.hours ||
        Number(existing?.projectChargeableHours) !== desired.hours
      ) {
        throw new Error(`Unexpected existing timesheet state on ${desired.date}`);
      }
      timesheets.push(existing);
      continue;
    }

    const timesheetPayload = await api<Wrapper<any>>("POST", "timesheet/entry", {
      body: {
        employee: { id: employee.id },
        project: { id: project.id },
        activity: { id: activity.id },
        date: desired.date,
        hours: desired.hours,
        projectChargeableHours: desired.hours,
      },
    });
    timesheets.push(unwrapValue(timesheetPayload));
  }
  const timesheet = timesheets[0];

  const vatTypePayload = await api<Wrapper<any>>("GET", "ledger/vatType", {
    query: { typeOfVat: "OUTGOING", vatDate: DATE, fields: "*" },
  });
  const vatType = chooseVatType(unwrapList(vatTypePayload));

  const orderPayload = await api<Wrapper<any>>("POST", "order", {
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
  const order = unwrapValue(orderPayload);

  const invoicePayload = await invoiceOrder(order.id);
  const invoice = unwrapValue(invoicePayload);

  if (
    timesheets.reduce((sum, entry) => sum + Number(entry?.hours ?? 0), 0) !== HOURS ||
    timesheets.reduce((sum, entry) => sum + Number(entry?.projectChargeableHours ?? 0), 0) !== HOURS ||
    Number(timesheet?.project?.id) !== Number(project.id) ||
    Number(timesheet?.activity?.id) !== Number(activity.id)
  ) {
    throw new Error("Timesheet verification failed");
  }
  if (
    Number(invoice?.customer?.id) !== Number(project.customer.id) ||
    Number(invoice?.orders?.[0]?.id) !== Number(order.id) ||
    Number(invoice?.amountExcludingVatCurrency) !== HOURS * RATE
  ) {
    throw new Error("Invoice verification failed");
  }

  console.log(JSON.stringify({
    employeeId: employee.id,
    projectId: project.id,
    activityId: activity.id,
    timesheetEntryIds: timesheets.map((entry) => entry.id),
    orderId: order.id,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
    amountCurrencyOutstanding: invoice.amountCurrencyOutstanding,
    timesheetChargeable: timesheets.map((entry) => entry.chargeable),
    timesheetHourlyRate: timesheets.map((entry) => entry.hourlyRate),
  }));
}

try {
  await main();
} catch (error) {
  if (error instanceof ApiError) {
    console.error(JSON.stringify({
      path: error.path,
      status: error.status,
      body: error.body,
    }, null, 2));
  }
  throw error;
}
