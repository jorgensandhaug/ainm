import { Buffer } from "node:buffer";

const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2/";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const DATE = "2026-03-20";

const EMPLOYEE_EMAIL = "codex.verify.1773957815637@example.org";
const PROJECT_NAME = "Sandbox Hour Invoice Project 1774020541520";
const CUSTOMER_ORG = "907791616";
const ACTIVITY_NAME = "Fakturerbart arbeid";
const HOURS = 3;
const RATE = 1550;

type Wrapper<T> = { value?: T; values?: T[] };

let calls = 0;

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

async function api<T>(method: string, path: string, opts?: {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}) {
  calls += 1;
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
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${text}`);
  }
  return text ? JSON.parse(text) as T : null;
}

function one<T>(items: T[], label: string) {
  if (items.length !== 1) {
    throw new Error(`${label}: expected 1, got ${items.length}`);
  }
  return items[0];
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

const employeePayload = await api<Wrapper<any>>("GET", "employee", {
  query: { email: EMPLOYEE_EMAIL, count: 10, fields: "*" },
});
const employee = one(
  (employeePayload.values ?? []).filter((item) => normalize(item.email) === normalize(EMPLOYEE_EMAIL)),
  "employee",
);

const projectPayload = await api<Wrapper<any>>("GET", "project", {
  query: { name: PROJECT_NAME, count: 50, fields: "*,customer(*)" },
});
const project = one(
  (projectPayload.values ?? []).filter(
    (item) => normalize(item.name) === normalize(PROJECT_NAME) && normalize(item.customer?.organizationNumber) === normalize(CUSTOMER_ORG),
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
const activity = one(
  (activityPayload.values ?? []).filter((item) => normalize(item.name) === normalize(ACTIVITY_NAME)),
  "activity",
);

if (activity.isChargeable !== true) {
  throw new Error(`Expected chargeable activity, got isChargeable=${String(activity.isChargeable)}`);
}

const holderPayload = await api<Wrapper<any>>("GET", "project/hourlyRates", {
  query: {
    projectId: project.id,
    count: 100,
    fields: "*,projectSpecificRates(*,employee(*),activity(*))",
  },
});
const holder = one(
  (holderPayload.values ?? []).filter((item) => Number(item.project?.id) === Number(project.id)),
  "projectHourlyRate",
);
const exactRate = one(
  (holder.projectSpecificRates ?? []).filter(
    (item: any) =>
      Number(item.employee?.id) === Number(employee.id) &&
      Number(item.activity?.id) === Number(activity.id) &&
      Number(item.hourlyRate) === RATE,
  ),
  "projectSpecificRate",
);

const timesheetPayload = await api<Wrapper<any>>("POST", "timesheet/entry", {
  body: {
    employee: { id: employee.id },
    project: { id: project.id },
    activity: { id: activity.id },
    date: DATE,
    hours: HOURS,
    projectChargeableHours: HOURS,
  },
});
const timesheet = timesheetPayload.value;

const vatTypePayload = await api<Wrapper<any>>("GET", "ledger/vatType", {
  query: { typeOfVat: "OUTGOING", vatDate: DATE, fields: "*" },
});
const vatType = one(vatTypePayload.values ?? [], "vatType");

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
const order = orderPayload.value;

const invoicePayload = await api<Wrapper<any>>("PUT", `order/${order.id}/:invoice`, {
  query: { invoiceDate: DATE, sendToCustomer: false },
});
const invoice = invoicePayload.value;

console.log(JSON.stringify({
  calls,
  activityId: activity.id,
  activityIsChargeable: activity.isChargeable,
  exactRateId: exactRate.id,
  exactRateHourlyRate: exactRate.hourlyRate,
  timesheetEntryId: timesheet.id,
  timesheetChargeable: timesheet.chargeable,
  timesheetHourlyRate: timesheet.hourlyRate,
  orderId: order.id,
  invoiceId: invoice.id,
  amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
  amountCurrencyOutstanding: invoice.amountCurrencyOutstanding,
}, null, 2));
