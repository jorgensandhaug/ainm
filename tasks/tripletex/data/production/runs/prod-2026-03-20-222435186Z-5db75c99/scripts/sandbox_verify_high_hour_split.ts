import { Buffer } from "node:buffer";

const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2/";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const EMPLOYEE_EMAIL = "codex.verify.1773957815637@example.org";
const PROJECT_NAME = "Sandbox Hour Invoice Project 1774020541520";
const CUSTOMER_ORG = "907791616";
const ACTIVITY_NAME = "Prosjektadministrasjon";
const RATE = 1450;
const TOTAL_HOURS = 39;
const DATE_ONE = "2026-03-26";
const DATE_TWO = "2026-03-27";

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

async function expectError(
  method: string,
  path: string,
  expectedStatus: number,
  expectedMessageFragment: string,
  opts?: { query?: Record<string, string | number | boolean | undefined>; body?: Json },
) {
  try {
    await api(method, path, opts);
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    const message = getMessage(error.body);
    if (error.status !== expectedStatus || !message.includes(expectedMessageFragment)) {
      throw new Error(`Unexpected error for ${path}: ${error.status} ${message}`);
    }
    return { status: error.status, message };
  }
  throw new Error(`Expected ${expectedStatus} for ${path}`);
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
        normalize(item?.customer?.organizationNumber) === normalize(CUSTOMER_ORG),
    ),
    "project",
  );

  const activityPayload = await api<Wrapper<any>>("GET", "activity/>forTimeSheet", {
    query: {
      projectId: project.id,
      employeeId: employee.id,
      date: DATE_ONE,
      query: ACTIVITY_NAME,
      filterExistingHours: false,
      count: 50,
      fields: "*",
    },
  });
  const activity = requireOne(
    unwrapList(activityPayload).filter((item) => normalize(item?.name) === normalize(ACTIVITY_NAME)),
    "activity",
  );

  const existingTimesheetPayload = await api<Wrapper<any>>("GET", "timesheet/entry", {
    query: {
      employeeId: employee.id,
      projectId: project.id,
      activityId: activity.id,
      dateFrom: DATE_ONE,
      dateTo: "2026-03-28",
      count: 100,
      fields: "*",
    },
  });
  for (const entry of unwrapList(existingTimesheetPayload)) {
    await api("DELETE", `timesheet/entry/${entry.id}`);
  }

  const over24 = await expectError("POST", "timesheet/entry", 422, "Kan ikke være over 24", {
    body: {
      employee: { id: employee.id },
      project: { id: project.id },
      activity: { id: activity.id },
      date: DATE_ONE,
      hours: TOTAL_HOURS,
      projectChargeableHours: TOTAL_HOURS,
    },
  });

  const firstTimesheetPayload = await api<Wrapper<any>>("POST", "timesheet/entry", {
    body: {
      employee: { id: employee.id },
      project: { id: project.id },
      activity: { id: activity.id },
      date: DATE_ONE,
      hours: 24,
      projectChargeableHours: 24,
    },
  });
  const firstTimesheet = unwrapValue(firstTimesheetPayload);

  const duplicateSameDay = await expectError("POST", "timesheet/entry", 409, "Det er allerede registrert timer", {
    body: {
      employee: { id: employee.id },
      project: { id: project.id },
      activity: { id: activity.id },
      date: DATE_ONE,
      hours: 15,
      projectChargeableHours: 15,
    },
  });

  const secondTimesheetPayload = await api<Wrapper<any>>("POST", "timesheet/entry", {
    body: {
      employee: { id: employee.id },
      project: { id: project.id },
      activity: { id: activity.id },
      date: DATE_TWO,
      hours: 15,
      projectChargeableHours: 15,
    },
  });
  const secondTimesheet = unwrapValue(secondTimesheetPayload);

  const vatTypePayload = await api<Wrapper<any>>("GET", "ledger/vatType", {
    query: { typeOfVat: "OUTGOING", vatDate: DATE_TWO, fields: "*" },
  });
  const vatType = requireOne(unwrapList(vatTypePayload), "vatType");

  const orderPayload = await api<Wrapper<any>>("POST", "order", {
    body: {
      customer: { id: project.customer.id },
      project: { id: project.id },
      orderDate: DATE_TWO,
      deliveryDate: DATE_TWO,
      orderLines: [
        {
          description: ACTIVITY_NAME,
          count: TOTAL_HOURS,
          unitPriceExcludingVatCurrency: RATE,
          vatType: { id: vatType.id },
        },
      ],
    },
  });
  const order = unwrapValue(orderPayload);

  const invoicePayload = await api<Wrapper<any>>("PUT", `order/${order.id}/:invoice`, {
    query: { invoiceDate: DATE_TWO, sendToCustomer: false },
  });
  const invoice = unwrapValue(invoicePayload);

  console.log(JSON.stringify({
    employeeId: employee.id,
    projectId: project.id,
    activityId: activity.id,
    activityIsChargeable: activity.isChargeable,
    over24,
    duplicateSameDay,
    firstTimesheet: {
      id: firstTimesheet.id,
      date: firstTimesheet.date,
      hours: firstTimesheet.hours,
      projectChargeableHours: firstTimesheet.projectChargeableHours,
      chargeable: firstTimesheet.chargeable,
      hourlyRate: firstTimesheet.hourlyRate,
    },
    secondTimesheet: {
      id: secondTimesheet.id,
      date: secondTimesheet.date,
      hours: secondTimesheet.hours,
      projectChargeableHours: secondTimesheet.projectChargeableHours,
      chargeable: secondTimesheet.chargeable,
      hourlyRate: secondTimesheet.hourlyRate,
    },
    orderId: order.id,
    invoiceId: invoice.id,
    amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
    amountCurrencyOutstanding: invoice.amountCurrencyOutstanding,
  }, null, 2));
}

await main();
