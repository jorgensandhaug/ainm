const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const PROJECT_NAME = "Sandbox Hour Invoice Project 1774020541520";
const EMPLOYEE_EMAIL = "codex.verify.1773957815637@example.org";
const CHARGEABLE_ACTIVITY_NAME = "Fakturerbart arbeid";
const NON_CHARGEABLE_ACTIVITY_NAME = "Prosjektadministrasjon";
const RATE = 1550;
const HOURS = 4;
const CHARGEABLE_DATE = "2026-03-21";
const NON_CHARGEABLE_DATE = "2026-03-22";

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
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new ApiError(`${method} ${path} failed`, res.status, data ?? text);
  return data as T;
}

function listValues<T>(data: any): T[] {
  return Array.isArray(data?.values) ? data.values : [];
}

function unwrap<T>(data: any): T {
  return data?.value ?? data;
}

function exactOne<T>(items: T[], label: string): T {
  if (items.length !== 1) throw new Error(`${label}: expected 1 match, got ${items.length}`);
  return items[0]!;
}

function toDateValue(value: string | undefined) {
  return value ? new Date(`${value}T00:00:00Z`).getTime() : Number.NEGATIVE_INFINITY;
}

function chooseApplicableHourlyRate(rates: any[], date: string) {
  const applicable = rates
    .filter((rate) => !rate.startDate || rate.startDate <= date)
    .sort((a, b) => toDateValue(b.startDate) - toDateValue(a.startDate));
  return applicable[0] ?? rates[0];
}

function chooseVatType(vatTypes: any[]) {
  return vatTypes.find((vat) => Number(vat.percentage) === 25) ?? vatTypes[0];
}

async function invoiceOrder(orderId: number, invoiceDate: string) {
  return unwrap<any>(
    await api<any>(
      "PUT",
      `/order/${orderId}/:invoice${queryString({ invoiceDate, sendToCustomer: false })}`,
    ),
  );
}

const employeeRes = await api<any>(
  "GET",
  `/employee${queryString({ email: EMPLOYEE_EMAIL, count: 10, fields: "*" })}`,
);
const employee = exactOne(
  listValues<any>(employeeRes).filter((item) => item.email === EMPLOYEE_EMAIL),
  "employee",
);

const projectRes = await api<any>(
  "GET",
  `/project${queryString({
    name: PROJECT_NAME,
    count: 20,
    fields: "*,customer(*)",
  })}`,
);
const project = exactOne(
  listValues<any>(projectRes).filter((item) => item.name === PROJECT_NAME),
  "project",
);

const chargeableActivitiesRes = await api<any>(
  "GET",
  `/activity/>forTimeSheet${queryString({
    projectId: project.id,
    employeeId: employee.id,
    date: CHARGEABLE_DATE,
    filterExistingHours: false,
    count: 50,
    fields: "*",
  })}`,
);
const activities = listValues<any>(chargeableActivitiesRes);
const chargeableActivity = exactOne(
  activities.filter((item) => item.name === CHARGEABLE_ACTIVITY_NAME),
  "chargeable activity",
);
const nonChargeableActivity = exactOne(
  activities.filter((item) => item.name === NON_CHARGEABLE_ACTIVITY_NAME),
  "non-chargeable activity",
);

const hourlyRatesRes = await api<any>(
  "GET",
  `/project/hourlyRates${queryString({ projectId: project.id, count: 100, fields: "*" })}`,
);
let projectHourlyRate = chooseApplicableHourlyRate(listValues<any>(hourlyRatesRes), CHARGEABLE_DATE);
if (!projectHourlyRate) throw new Error("No project hourly rate holder");

if (projectHourlyRate.hourlyRateModel !== "TYPE_PROJECT_SPECIFIC_HOURLY_RATES") {
  projectHourlyRate = unwrap<any>(
    await api<any>("PUT", `/project/hourlyRates/${projectHourlyRate.id}`, {
      project: { id: project.id },
      startDate: projectHourlyRate.startDate ?? CHARGEABLE_DATE,
      hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
    }),
  );
}

const projectSpecificRate = unwrap<any>(
  await api<any>("POST", "/project/hourlyRates/projectSpecificRates", {
    projectHourlyRate: { id: projectHourlyRate.id },
    employee: { id: employee.id },
    activity: { id: chargeableActivity.id },
    hourlyRate: RATE,
  }),
);

const chargeableTimesheet = unwrap<any>(
  await api<any>("POST", "/timesheet/entry", {
    employee: { id: employee.id },
    project: { id: project.id },
    activity: { id: chargeableActivity.id },
    date: CHARGEABLE_DATE,
    hours: HOURS,
    projectChargeableHours: HOURS,
  }),
);

const vatTypeRes = await api<any>(
  "GET",
  `/ledger/vatType${queryString({ typeOfVat: "OUTGOING", vatDate: CHARGEABLE_DATE, fields: "*" })}`,
);
const vatType = chooseVatType(listValues<any>(vatTypeRes));

const chargeableOrder = unwrap<any>(
  await api<any>("POST", "/order", {
    customer: { id: project.customer.id },
    project: { id: project.id },
    orderDate: CHARGEABLE_DATE,
    deliveryDate: CHARGEABLE_DATE,
    orderLines: [
      {
        description: `${CHARGEABLE_ACTIVITY_NAME} sandbox proof`,
        count: HOURS,
        unitPriceExcludingVatCurrency: RATE,
        vatType: { id: vatType.id },
      },
    ],
  }),
);
const chargeableInvoice = await invoiceOrder(chargeableOrder.id, CHARGEABLE_DATE);

const nonChargeableTimesheet = unwrap<any>(
  await api<any>("POST", "/timesheet/entry", {
    employee: { id: employee.id },
    project: { id: project.id },
    activity: { id: nonChargeableActivity.id },
    date: NON_CHARGEABLE_DATE,
    hours: HOURS,
    projectChargeableHours: HOURS,
  }),
);

const nonChargeableOrder = unwrap<any>(
  await api<any>("POST", "/order", {
    customer: { id: project.customer.id },
    project: { id: project.id },
    orderDate: NON_CHARGEABLE_DATE,
    deliveryDate: NON_CHARGEABLE_DATE,
    orderLines: [
      {
        description: `${NON_CHARGEABLE_ACTIVITY_NAME} sandbox fallback proof`,
        count: HOURS,
        unitPriceExcludingVatCurrency: RATE,
        vatType: { id: vatType.id },
      },
    ],
  }),
);
const nonChargeableInvoice = await invoiceOrder(nonChargeableOrder.id, NON_CHARGEABLE_DATE);

console.log(
  JSON.stringify(
    {
      employee: { id: employee.id, email: employee.email },
      project: {
        id: project.id,
        name: project.name,
        customer: {
          id: project.customer.id,
          name: project.customer.name,
          organizationNumber: project.customer.organizationNumber,
        },
      },
      activities: {
        chargeable: {
          id: chargeableActivity.id,
          name: chargeableActivity.name,
          isChargeable: chargeableActivity.isChargeable,
        },
        nonChargeable: {
          id: nonChargeableActivity.id,
          name: nonChargeableActivity.name,
          isChargeable: nonChargeableActivity.isChargeable,
        },
      },
      chargeableProof: {
        projectHourlyRateId: projectHourlyRate.id,
        projectSpecificRateId: projectSpecificRate.id,
        timesheetEntryId: chargeableTimesheet.id,
        timesheetChargeable: chargeableTimesheet.chargeable,
        timesheetHourlyRate: chargeableTimesheet.hourlyRate,
        orderId: chargeableOrder.id,
        invoiceId: chargeableInvoice.id,
        amountExcludingVatCurrency: chargeableInvoice.amountExcludingVatCurrency,
      },
      nonChargeableFallbackProof: {
        timesheetEntryId: nonChargeableTimesheet.id,
        timesheetChargeable: nonChargeableTimesheet.chargeable,
        timesheetHourlyRate: nonChargeableTimesheet.hourlyRate,
        orderId: nonChargeableOrder.id,
        invoiceId: nonChargeableInvoice.id,
        amountExcludingVatCurrency: nonChargeableInvoice.amountExcludingVatCurrency,
      },
    },
    null,
    2,
  ),
);
