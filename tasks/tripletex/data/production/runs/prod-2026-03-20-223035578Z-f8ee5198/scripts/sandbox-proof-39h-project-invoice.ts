import { Buffer } from "node:buffer";

const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const EMPLOYEE_EMAIL = "codex.verify.1773957815637@example.org";
const PROJECT_NAME = "Sandbox Hour Invoice Project 1774020541520";
const CUSTOMER_ORG_NO = "907791616";
const ACTIVITY_NAME = "Prosjektadministrasjon";
const TOTAL_HOURS = 39;
const HOURLY_RATE = 1450;
const DATE_ONE = "2026-05-11";
const DATE_TWO = "2026-05-12";

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
let callCount = 0;

type WrappedList<T> = { values?: T[] };
type WrappedValue<T> = { value?: T };

type Employee = { id: number; email?: string };
type Project = {
  id: number;
  name?: string;
  customer?: { id?: number; organizationNumber?: string | number | null };
};
type Activity = { id: number; name?: string; isChargeable?: boolean };
type VatType = { id: number; percentage?: number };

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
  callCount += 1;
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
  const body = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    throw new ApiError(res.status, body, `HTTP ${res.status} ${method} ${path}`);
  }
  return body as T;
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function exactOne<T>(items: T[], predicate: (item: T) => boolean, label: string): T {
  const matches = items.filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`${label}: expected 1 match, got ${matches.length}`);
  }
  return matches[0];
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
      normalize(item.customer?.organizationNumber) === normalize(CUSTOMER_ORG_NO),
    "project",
  );
  if (!project.customer?.id) throw new Error("project.customer.id missing");

  const activityResp = await request<WrappedList<Activity>>("GET", "activity/>forTimeSheet", {
    query: {
      projectId: project.id,
      employeeId: employee.id,
      date: DATE_TWO,
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
  if (activity.isChargeable !== false) {
    throw new Error(`Expected non-chargeable activity, got ${String(activity.isChargeable)}`);
  }

  const firstEntryResp = await request<WrappedValue<Record<string, unknown>>>("POST", "timesheet/entry", {
    body: {
      employee: { id: employee.id },
      project: { id: project.id },
      activity: { id: activity.id },
      date: DATE_ONE,
      hours: 24,
      projectChargeableHours: 24,
    },
  });

  const secondEntryResp = await request<WrappedValue<Record<string, unknown>>>("POST", "timesheet/entry", {
    body: {
      employee: { id: employee.id },
      project: { id: project.id },
      activity: { id: activity.id },
      date: DATE_TWO,
      hours: 15,
      projectChargeableHours: 15,
    },
  });

  const vatResp = await request<WrappedList<VatType>>("GET", "ledger/vatType", {
    query: { typeOfVat: "OUTGOING", vatDate: DATE_TWO, fields: "*" },
  });
  const vatType = chooseVatType(vatResp.values ?? []);

  const orderResp = await request<WrappedValue<{ id?: number }>>("POST", "order", {
    body: {
      customer: { id: project.customer.id },
      project: { id: project.id },
      orderDate: DATE_TWO,
      deliveryDate: DATE_TWO,
      orderLines: [
        {
          description: ACTIVITY_NAME,
          count: TOTAL_HOURS,
          unitPriceExcludingVatCurrency: HOURLY_RATE,
          vatType: { id: vatType.id },
        },
      ],
    },
  });
  const orderId = orderResp.value?.id;
  if (!orderId) throw new Error("order.id missing");

  const invoiceResp = await request<WrappedValue<Record<string, unknown>>>("PUT", `order/${orderId}/:invoice`, {
    query: { invoiceDate: DATE_TWO, sendToCustomer: false },
  });

  console.log(
    JSON.stringify(
      {
        callCount,
        activityIsChargeable: activity.isChargeable,
        firstEntryHours: firstEntryResp.value?.hours ?? null,
        firstEntryDate: firstEntryResp.value?.date ?? null,
        secondEntryHours: secondEntryResp.value?.hours ?? null,
        secondEntryDate: secondEntryResp.value?.date ?? null,
        invoiceId: invoiceResp.value?.id ?? null,
        invoiceNumber: invoiceResp.value?.invoiceNumber ?? null,
        amountExcludingVatCurrency: invoiceResp.value?.amountExcludingVatCurrency ?? null,
        amountCurrencyOutstanding: invoiceResp.value?.amountCurrencyOutstanding ?? null,
      },
      null,
      2,
    ),
  );
}

await main();
