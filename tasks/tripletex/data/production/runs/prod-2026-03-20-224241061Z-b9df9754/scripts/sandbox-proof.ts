import { Buffer } from "node:buffer";

const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const RUN_DATE = "2026-06-21";
const EMPLOYEE_EMAIL = "codex.verify.1773957815637@example.org";
const PROJECT_NAME = "Sandbox Hour Invoice Project 1774020541520";
const CUSTOMER_ORG_NO = "907791616";
const ACTIVITY_NAME = "Prosjektadministrasjon";
const HOURS = 14;
const HOURLY_RATE = 1150;

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

type WrappedList<T> = { values?: T[] };
type WrappedValue<T> = { value?: T };

let calls = 0;

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
  calls += 1;
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
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function exactOne<T>(items: T[], label: string): T {
  if (items.length !== 1) {
    throw new Error(`${label}: expected exactly 1 match, got ${items.length}`);
  }
  return items[0]!;
}

async function main() {
  const employeeResp = await request<WrappedList<{ id: number; email?: string }>>("GET", "employee", {
    query: { email: EMPLOYEE_EMAIL, count: 10, fields: "*" },
  });
  const employee = exactOne(
    (employeeResp.values ?? []).filter((item) => normalize(item.email) === normalize(EMPLOYEE_EMAIL)),
    "employee",
  );

  const projectResp = await request<WrappedList<{ id: number; name?: string; customer?: { id: number; organizationNumber?: string } }>>(
    "GET",
    "project",
    {
      query: { name: PROJECT_NAME, count: 50, fields: "*,customer(*)" },
    },
  );
  const project = exactOne(
    (projectResp.values ?? []).filter(
      (item) =>
        normalize(item.name) === normalize(PROJECT_NAME) &&
        normalize(item.customer?.organizationNumber) === normalize(CUSTOMER_ORG_NO),
    ),
    "project",
  );

  const activityResp = await request<WrappedList<{ id: number; name?: string; isChargeable?: boolean }>>(
    "GET",
    "activity/>forTimeSheet",
    {
      query: {
        projectId: project.id,
        employeeId: employee.id,
        date: RUN_DATE,
        query: ACTIVITY_NAME,
        filterExistingHours: false,
        count: 50,
        fields: "*",
      },
    },
  );
  const activity = exactOne(
    (activityResp.values ?? []).filter((item) => normalize(item.name) === normalize(ACTIVITY_NAME)),
    "activity",
  );

  if (activity.isChargeable !== false) {
    throw new Error(`Expected non-chargeable activity, got isChargeable=${String(activity.isChargeable)}`);
  }

  const timesheetResp = await request<
    WrappedValue<{ id: number; hours?: number; projectChargeableHours?: number; chargeable?: boolean; hourlyRate?: number }>
  >("POST", "timesheet/entry", {
    body: {
      employee: { id: employee.id },
      project: { id: project.id },
      activity: { id: activity.id },
      date: RUN_DATE,
      hours: HOURS,
      projectChargeableHours: HOURS,
    },
  });
  const timesheet = timesheetResp.value;
  if (!timesheet?.id) throw new Error("timesheet entry missing");

  const vatResp = await request<WrappedList<{ id: number }>>("GET", "ledger/vatType", {
    query: { typeOfVat: "OUTGOING", vatDate: RUN_DATE, fields: "*" },
  });
  const vatType = exactOne(vatResp.values ?? [], "vatType");

  const orderResp = await request<WrappedValue<{ id: number }>>("POST", "order", {
    body: {
      customer: { id: project.customer?.id },
      project: { id: project.id },
      orderDate: RUN_DATE,
      deliveryDate: RUN_DATE,
      orderLines: [
        {
          description: "Analyse",
          count: HOURS,
          unitPriceExcludingVatCurrency: HOURLY_RATE,
          vatType: { id: vatType.id },
        },
      ],
    },
  });
  const order = orderResp.value;
  if (!order?.id) throw new Error("order missing");

  const invoiceResp = await request<
    WrappedValue<{ id: number; amountExcludingVatCurrency?: number; amountCurrencyOutstanding?: number; orders?: Array<{ id: number }> }>
  >("PUT", `order/${order.id}/:invoice`, {
    query: { invoiceDate: RUN_DATE, sendToCustomer: false },
  });
  const invoice = invoiceResp.value;
  if (!invoice?.id) throw new Error("invoice missing");

  console.log(
    JSON.stringify(
      {
        calls,
        proofDate: RUN_DATE,
        employeeId: employee.id,
        projectId: project.id,
        customerId: project.customer?.id,
        activityId: activity.id,
        activityIsChargeable: activity.isChargeable,
        timesheetEntryId: timesheet.id,
        timesheetHours: timesheet.hours,
        timesheetProjectChargeableHours: timesheet.projectChargeableHours,
        timesheetChargeable: timesheet.chargeable,
        timesheetHourlyRate: timesheet.hourlyRate,
        orderId: order.id,
        invoiceId: invoice.id,
        amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
        amountCurrencyOutstanding: invoice.amountCurrencyOutstanding,
        invoiceOrderIds: invoice.orders?.map((item) => item.id) ?? [],
      },
      null,
      2,
    ),
  );
}

await main();
