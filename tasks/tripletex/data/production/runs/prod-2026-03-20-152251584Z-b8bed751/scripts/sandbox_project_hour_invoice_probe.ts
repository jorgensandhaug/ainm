const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

type Envelope<T> = { value?: T; values?: T[]; fullResultSize?: number };
type Ref = { id: number; [key: string]: unknown };

class HttpError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

const auth = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = res.status === 204 ? "" : await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new HttpError(res.status, body);
  return body as T;
}

function values<T>(env: Envelope<T> | undefined): T[] {
  return env?.values ?? [];
}

function log(label: string, value: unknown) {
  console.log(`\n## ${label}`);
  console.log(JSON.stringify(value, null, 2));
}

function isoWeekYear(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-${String(week).padStart(2, "0")}`;
}

async function discoverEmployees() {
  const employees = await call<Envelope<Ref & { email?: string; firstName?: string; lastName?: string }>>(
    `/employee?count=20&fields=*`,
  );
  log("employees", values(employees).map((e) => ({ id: e.id, email: e.email, name: `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim() })));
}

async function discoverAssignableManagers() {
  const employees = await call<Envelope<Ref & { email?: string; firstName?: string; lastName?: string }>>(
    `/employee?assignableProjectManagers=true&count=20&fields=*`,
  );
  log("assignable-project-managers", values(employees).map((e) => ({ id: e.id, email: e.email, name: `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim() })));
}

async function discoverActivities() {
  const activities = await call<Envelope<Ref & { name?: string; isChargeable?: boolean; activityType?: string }>>(
    `/activity?count=50&fields=*`,
  );
  log("activities", values(activities).map((a) => ({ id: a.id, name: a.name, isChargeable: a.isChargeable, activityType: a.activityType })));
}

async function createChargeableActivity(name: string) {
  const created = await call<Envelope<Ref & { name?: string; isChargeable?: boolean; activityType?: string }>>(`/activity`, {
    method: "POST",
    body: JSON.stringify({
      name,
      activityType: "PROJECT_GENERAL_ACTIVITY",
      isChargeable: true,
    }),
  });
  log("created-activity", created.value);
}

async function createCustomerAndProject() {
  const today = "2026-03-20";
  const customerName = `Sandbox Hour Invoice Customer ${Date.now()}`;
  const org = String(Math.floor(900000000 + Math.random() * 9999999));

  const managers = await call<Envelope<Ref & { email?: string; firstName?: string; lastName?: string }>>(
    `/employee?assignableProjectManagers=true&count=10&fields=*`,
  );
  const manager = values(managers)[0];
  if (!manager) throw new Error("No assignable project manager found");

  const customer = await call<Envelope<Ref & { id: number; name?: string }>>(`/customer`, {
    method: "POST",
    body: JSON.stringify({
      name: customerName,
      organizationNumber: org,
      invoiceSendMethod: "MANUAL",
    }),
  });

  const project = await call<Envelope<Ref & { id: number; name?: string }>>(`/project`, {
    method: "POST",
    body: JSON.stringify({
      name: `Sandbox Hour Invoice Project ${Date.now()}`,
      startDate: today,
      customer: { id: customer.value!.id },
      projectManager: { id: manager.id },
    }),
  });

  log("sandbox-setup", {
    customer: customer.value,
    project: project.value,
    manager,
  });
}

async function getProjectHourlyRates(projectId: string) {
  const res = await call<Envelope<unknown>>(`/project/hourlyRates?projectId=${projectId}&count=100&fields=*`);
  log("project-hourly-rates", res);
}

async function putProjectHourlyRate(rateId: string, projectId: string, mode: string, fixedRate?: string) {
  const payload: Record<string, unknown> = {
    project: { id: Number(projectId) },
    startDate: "2026-03-20",
    hourlyRateModel: mode,
  };
  if (fixedRate !== undefined) payload.fixedRate = Number(fixedRate);
  const res = await call<Envelope<unknown>>(`/project/hourlyRates/${rateId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  log("put-project-hourly-rate", { payload, response: res });
}

async function postProjectSpecificRate(rateId: string, employeeId: string, activityId: string, hourlyRate: string) {
  const payload = {
    projectHourlyRate: { id: Number(rateId) },
    employee: { id: Number(employeeId) },
    activity: { id: Number(activityId) },
    hourlyRate: Number(hourlyRate),
  };
  const res = await call<Envelope<unknown>>(`/project/hourlyRates/projectSpecificRates`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  log("post-project-specific-rate", { payload, response: res });
}

async function postTimesheet(employeeId: string, projectId: string, activityId: string, date: string, hours: string) {
  const payload = {
    employee: { id: Number(employeeId) },
    project: { id: Number(projectId) },
    activity: { id: Number(activityId) },
    date,
    hours: Number(hours),
    projectChargeableHours: Number(hours),
  };
  const res = await call<Envelope<unknown>>(`/timesheet/entry`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  log("post-timesheet", { payload, response: res });
}

async function approveWeek(employeeId: string, date: string) {
  const weekYear = isoWeekYear(date);
  const res = await call<Envelope<unknown>>(
    `/timesheet/week/:approve?employeeId=${employeeId}&weekYear=${encodeURIComponent(weekYear)}`,
    { method: "PUT" },
  );
  log("approve-week", { weekYear, response: res });
}

async function getProjectHourlist(projectId: string, dateFrom: string, dateTo: string) {
  const res = await call<Envelope<unknown>>(
    `/project/${projectId}/period/hourlistReport?dateFrom=${dateFrom}&dateTo=${dateTo}&fields=*`,
  );
  log("project-hourlist", res);
}

async function getProjectReserve(projectId: string, dateFrom: string, dateTo: string) {
  const res = await call<Envelope<unknown>>(
    `/project/${projectId}/period/invoicingReserve?dateFrom=${dateFrom}&dateTo=${dateTo}&fields=*`,
  );
  log("project-invoicing-reserve", res);
}

async function postOrder(customerId: string, projectId: string) {
  const payload = {
    customer: { id: Number(customerId) },
    project: { id: Number(projectId) },
    orderDate: "2026-03-20",
    deliveryDate: "2026-03-20",
  };
  const res = await call<Envelope<unknown>>(`/order`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  log("post-order", { payload, response: res });
}

async function postOrderIncludeHours(customerId: string, projectId: string) {
  const payload = {
    customer: { id: Number(customerId) },
    project: { id: Number(projectId) },
    orderDate: "2026-03-20",
    deliveryDate: "2026-03-20",
    preliminaryInvoice: {
      invoiceDate: "2026-03-20",
      invoiceDueDate: "2026-04-03",
      orders: [
        {
          customer: { id: Number(customerId) },
          project: { id: Number(projectId) },
          orderDate: "2026-03-20",
          deliveryDate: "2026-03-20",
        },
      ],
      projectInvoiceDetails: [
        {
          project: { id: Number(projectId) },
          includeHours: true,
          includeOrderLinesAndReinvoicing: true,
          includeOnAccountBalance: false,
        },
      ],
    },
  };
  const res = await call<Envelope<unknown>>(`/order`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  log("post-order-include-hours", { payload, response: res });
}

async function putOrderIncludeHours(orderId: string, projectId: string) {
  const payload = {
    preliminaryInvoice: {
      invoiceDate: "2026-03-20",
      invoiceDueDate: "2026-04-03",
      orders: [
        {
          id: Number(orderId),
          project: { id: Number(projectId) },
          orderDate: "2026-03-20",
          deliveryDate: "2026-03-20",
        },
      ],
      projectInvoiceDetails: [
        {
          invoice: { id: 0 },
          project: { id: Number(projectId) },
          includeHours: true,
          includeOrderLinesAndReinvoicing: true,
          includeOnAccountBalance: false,
        },
      ],
    },
  };
  const res = await call<Envelope<unknown>>(`/order/${orderId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  log("put-order-include-hours", { payload, response: res });
}

async function invoiceOrder(orderId: string, date: string) {
  const res = await call<Envelope<unknown>>(`/order/${orderId}/:invoice?invoiceDate=${date}&sendToCustomer=false`, {
    method: "PUT",
  });
  log("invoice-order", res);
}

async function getOrder(orderId: string) {
  const res = await call<Envelope<unknown>>(`/order/${orderId}?fields=*`);
  log("get-order", res);
}

async function getInvoice(invoiceId: string) {
  const res = await call<Envelope<unknown>>(`/invoice/${invoiceId}?fields=*`);
  log("get-invoice", res);
}

async function getInvoiceDetails(detailsId: string) {
  const res = await call<Envelope<unknown>>(`/invoice/details/${detailsId}?fields=*`);
  log("get-invoice-details", res);
}

async function postInvoiceProjectHours(customerId: string, projectId: string) {
  const payload = {
    invoiceDate: "2026-03-20",
    invoiceDueDate: "2026-04-03",
    customer: { id: Number(customerId) },
    orders: [
      {
        customer: { id: Number(customerId) },
        project: { id: Number(projectId) },
        orderDate: "2026-03-20",
        deliveryDate: "2026-03-20",
      },
    ],
    projectInvoiceDetails: [
      {
        project: { id: Number(projectId) },
        includeHours: true,
        includeOrderLinesAndReinvoicing: true,
        includeOnAccountBalance: false,
      },
    ],
  };
  const res = await call<Envelope<unknown>>(`/invoice?sendToCustomer=false`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  log("post-invoice-project-hours", { payload, response: res });
}

async function putInvoiceDetails(detailsId: string, projectId: string, invoiceId: string) {
  const payload = {
    project: { id: Number(projectId) },
    invoice: { id: Number(invoiceId) },
    includeHours: true,
    includeOrderLinesAndReinvoicing: true,
    includeOnAccountBalance: false,
  };
  const res = await call<Envelope<unknown>>(`/invoice/details/${detailsId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  log("put-invoice-details", { payload, response: res });
}

async function putInvoice(invoiceId: string, customerId: string, orderId: string, projectId: string) {
  const payload = {
    invoiceDate: "2026-03-20",
    invoiceDueDate: "2026-04-03",
    customer: { id: Number(customerId) },
    orders: [
      {
        id: Number(orderId),
        customer: { id: Number(customerId) },
        project: { id: Number(projectId) },
        orderDate: "2026-03-20",
        deliveryDate: "2026-03-20",
      },
    ],
    projectInvoiceDetails: [
      {
        project: { id: Number(projectId) },
        invoice: { id: Number(invoiceId) },
        includeHours: true,
        includeOrderLinesAndReinvoicing: true,
        includeOnAccountBalance: false,
      },
    ],
  };
  const res = await call<Envelope<unknown>>(`/invoice/${invoiceId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  log("put-invoice", { payload, response: res });
}

async function getOutgoingVatTypes(date: string) {
  const res = await call<Envelope<unknown>>(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${date}&fields=*`);
  log("outgoing-vat-types", res);
}

async function postOrderWithLine(customerId: string, projectId: string, vatTypeId: string, description: string, count: string, unitPrice: string) {
  const payload = {
    customer: { id: Number(customerId) },
    project: { id: Number(projectId) },
    orderDate: "2026-03-20",
    deliveryDate: "2026-03-20",
    orderLines: [
      {
        description,
        count: Number(count),
        unitPriceExcludingVatCurrency: Number(unitPrice),
        vatType: { id: Number(vatTypeId) },
      },
    ],
  };
  const res = await call<Envelope<unknown>>(`/order`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  log("post-order-with-line", { payload, response: res });
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === "employees") return discoverEmployees();
  if (cmd === "managers") return discoverAssignableManagers();
  if (cmd === "activities") return discoverActivities();
  if (cmd === "create-activity") return createChargeableActivity(process.argv[3] ?? `Sandbox Activity ${Date.now()}`);
  if (cmd === "create-setup") return createCustomerAndProject();
  if (cmd === "get-project-hourly-rates") return getProjectHourlyRates(process.argv[3]!);
  if (cmd === "put-project-hourly-rate") return putProjectHourlyRate(process.argv[3]!, process.argv[4]!, process.argv[5]!, process.argv[6]);
  if (cmd === "post-project-specific-rate") return postProjectSpecificRate(process.argv[3]!, process.argv[4]!, process.argv[5]!, process.argv[6]!);
  if (cmd === "post-timesheet") return postTimesheet(process.argv[3]!, process.argv[4]!, process.argv[5]!, process.argv[6]!, process.argv[7]!);
  if (cmd === "approve-week") return approveWeek(process.argv[3]!, process.argv[4]!);
  if (cmd === "get-project-hourlist") return getProjectHourlist(process.argv[3]!, process.argv[4]!, process.argv[5]!);
  if (cmd === "get-project-reserve") return getProjectReserve(process.argv[3]!, process.argv[4]!, process.argv[5]!);
  if (cmd === "post-order") return postOrder(process.argv[3]!, process.argv[4]!);
  if (cmd === "post-order-include-hours") return postOrderIncludeHours(process.argv[3]!, process.argv[4]!);
  if (cmd === "put-order-include-hours") return putOrderIncludeHours(process.argv[3]!, process.argv[4]!);
  if (cmd === "invoice-order") return invoiceOrder(process.argv[3]!, process.argv[4]!);
  if (cmd === "get-order") return getOrder(process.argv[3]!);
  if (cmd === "get-invoice") return getInvoice(process.argv[3]!);
  if (cmd === "get-invoice-details") return getInvoiceDetails(process.argv[3]!);
  if (cmd === "post-invoice-project-hours") return postInvoiceProjectHours(process.argv[3]!, process.argv[4]!);
  if (cmd === "put-invoice-details") return putInvoiceDetails(process.argv[3]!, process.argv[4]!, process.argv[5]!);
  if (cmd === "put-invoice") return putInvoice(process.argv[3]!, process.argv[4]!, process.argv[5]!, process.argv[6]!);
  if (cmd === "get-outgoing-vat-types") return getOutgoingVatTypes(process.argv[3]!);
  if (cmd === "post-order-with-line") return postOrderWithLine(process.argv[3]!, process.argv[4]!, process.argv[5]!, process.argv[6]!, process.argv[7]!, process.argv[8]!);
  throw new Error("Unknown command");
}

main().catch((error) => {
  if (error instanceof HttpError) {
    console.error(JSON.stringify(error.body, null, 2));
  }
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
