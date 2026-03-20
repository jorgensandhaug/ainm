const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const TASK_DATE = "2026-03-21";
const EMPLOYEE_EMAIL = "codex.verify.1773957815637@example.org";
const PROJECT_NAME = "Sandbox Hour Invoice Project 1774020541520";
const ACTIVITY_NAME = "Prosjektadministrasjon";
const HOURS = 18;
const HOURLY_RATE = 950;

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
let callCount = 0;

type WrappedList<T> = { values?: T[] };
type WrappedValue<T> = { value?: T };

type Employee = { id: number; email?: string };
type Project = {
  id: number;
  name?: string;
  customer?: { id: number; name?: string; organizationNumber?: string } | null;
};
type Activity = { id: number; name?: string; isChargeable?: boolean };
type VatType = { id: number; percentage?: number };

function endpoint(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(path, BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function request<T>(
  method: string,
  path: string,
  options?: { query?: Record<string, string | number | boolean | undefined>; body?: unknown },
): Promise<T> {
  callCount += 1;
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
  const body = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status} ${JSON.stringify(body)}`);
  return body as T;
}

function exactOne<T>(items: T[], predicate: (item: T) => boolean, label: string): T {
  const matches = items.filter(predicate);
  if (matches.length !== 1) throw new Error(`${label}: expected 1 match, got ${matches.length}`);
  return matches[0];
}

function normalize(v: string | undefined | null) {
  return (v ?? "").trim().toLowerCase();
}

async function main() {
  const employeeResp = await request<WrappedList<Employee>>("GET", "employee", {
    query: { email: EMPLOYEE_EMAIL, count: 10, fields: "*" },
  });
  const employee = exactOne(employeeResp.values ?? [], (e) => normalize(e.email) === normalize(EMPLOYEE_EMAIL), "employee");

  const projectResp = await request<WrappedList<Project>>("GET", "project", {
    query: { name: PROJECT_NAME, count: 50, fields: "*,customer(*)" },
  });
  const project = exactOne(projectResp.values ?? [], (p) => normalize(p.name) === normalize(PROJECT_NAME), "project");
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
    (a) => normalize(a.name) === normalize(ACTIVITY_NAME),
    "activity",
  );
  if (activity.isChargeable !== false) throw new Error(`expected non-chargeable activity, got ${activity.isChargeable}`);

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

  const vatResp = await request<WrappedList<VatType>>("GET", "ledger/vatType", {
    query: { typeOfVat: "OUTGOING", vatDate: TASK_DATE, fields: "*" },
  });
  const vatType = (vatResp.values ?? []).find((vat) => vat.percentage === 25) ?? (vatResp.values ?? [])[0];
  if (!vatType?.id) throw new Error("vatType.id missing");

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

  const invoiceResp = await request<WrappedValue<Record<string, unknown>>>("PUT", `order/${orderId}/:invoice`, {
    query: { invoiceDate: TASK_DATE, sendToCustomer: false },
  });

  console.log(
    JSON.stringify(
      {
        callCount,
        employeeId: employee.id,
        projectId: project.id,
        customerId: project.customer.id,
        activityId: activity.id,
        activityIsChargeable: activity.isChargeable,
        timesheetId: timesheetResp.value?.id ?? null,
        timesheetHourlyRate: timesheetResp.value?.hourlyRate ?? null,
        timesheetChargeable: timesheetResp.value?.chargeable ?? null,
        orderId,
        invoiceId: invoiceResp.value?.id ?? null,
        amountExcludingVatCurrency: invoiceResp.value?.amountExcludingVatCurrency ?? null,
        amountCurrencyOutstanding: invoiceResp.value?.amountCurrencyOutstanding ?? null,
      },
      null,
      2,
    ),
  );
}

await main();
