const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const TODAY = "2026-03-20";
const FIXED_PRICE = 350650;
const PARTIAL_AMOUNT = Number((FIXED_PRICE * 0.25).toFixed(2));

type ApiList<T> = { values?: T[]; fullResultSize?: number };
type ApiValue<T> = { value: T };

type Employee = {
  id: number;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
};

type Customer = {
  id: number;
  name?: string | null;
  organizationNumber?: string | null;
};

type Project = {
  id: number;
  name?: string | null;
  startDate?: string | null;
  customer?: Customer | null;
};

type VatType = {
  id: number;
  percentage?: number | null;
  code?: string | null;
};

type Order = { id: number };

type Invoice = {
  id: number;
  amountExcludingVatCurrency?: number | null;
  amountCurrency?: number | null;
  amountCurrencyOutstanding?: number | null;
};

let apiCalls = 0;

function endpoint(path: string) {
  return new URL(path, BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`).toString();
}

function authHeader() {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  apiCalls += 1;
  const response = await fetch(endpoint(path), {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${path} -> ${response.status} ${text}`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function uniqueSeed() {
  return `codex-opt-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function makeOrgNumber(seedDigits: string) {
  const digits = seedDigits.replace(/\D/g, "").padEnd(8, "0").slice(0, 8);
  return `88${digits.slice(0, 7)}`;
}

async function main() {
  const seed = uniqueSeed();
  const orgNo = makeOrgNumber(String(Date.now()).slice(-8));
  const customerName = `Codex Optimization ${seed} GmbH`;
  const projectName = `ERP Optimization ${seed}`;
  const invoiceLine = `Milestone 25% ${seed}`;

  const managerResponse = await request<ApiList<Employee>>(
    "GET",
    "employee?assignableProjectManagers=true&count=50&fields=*",
  );
  const manager = (managerResponse.values ?? []).find((employee) => employee.email);
  if (!manager?.email) throw new Error("No assignable project manager with email found");

  const createdCustomer = await request<ApiValue<Customer>>("POST", "customer", {
    name: customerName,
    organizationNumber: orgNo,
    invoiceSendMethod: "MANUAL",
  });

  const createdProject = await request<ApiValue<Project>>("POST", "project", {
    name: projectName,
    startDate: TODAY,
    customer: { id: createdCustomer.value.id },
    projectManager: { id: manager.id },
    isFixedPrice: true,
    fixedprice: 120000,
    invoiceOnAccountVatHigh: false,
  });

  const projectFirstResponse = await request<ApiList<Project>>(
    "GET",
    `project?name=${encodeURIComponent(projectName)}&count=50&fields=*,customer(*)`,
  );
  const resolvedProject = (projectFirstResponse.values ?? []).find(
    (project) => project.name === projectName && project.customer?.organizationNumber === orgNo,
  );
  if (!resolvedProject?.customer?.id || !resolvedProject.startDate) {
    throw new Error("Project-first resolver did not return customer id and startDate");
  }

  const updatedProject = await request<ApiValue<Project>>("PUT", `project/${resolvedProject.id}`, {
    name: projectName,
    startDate: resolvedProject.startDate,
    customer: { id: resolvedProject.customer.id },
    projectManager: { id: manager.id },
    isFixedPrice: true,
    fixedprice: FIXED_PRICE,
    invoiceOnAccountVatHigh: false,
  });

  const vatResponse = await request<ApiList<VatType>>(
    "GET",
    `ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`,
  );
  const vatType =
    (vatResponse.values ?? []).find((entry) => entry.percentage === 25) ??
    (vatResponse.values ?? [])[0];
  if (!vatType) throw new Error("No outgoing VAT type found");

  const explicitOrder = await request<ApiValue<Order>>("POST", "order", {
    customer: { id: resolvedProject.customer.id },
    project: { id: resolvedProject.id },
    orderDate: TODAY,
    deliveryDate: TODAY,
    invoiceOnAccountVatHigh: false,
    orderLines: [
      {
        description: `${invoiceLine} explicit VAT`,
        count: 1,
        unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
        vatType: { id: vatType.id },
      },
    ],
  });

  const explicitInvoice = await request<ApiValue<Invoice>>(
    "PUT",
    `order/${explicitOrder.value.id}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`,
  );

  const noVatTypeOrder = await request<ApiValue<Order>>("POST", "order", {
    customer: { id: resolvedProject.customer.id },
    project: { id: resolvedProject.id },
    orderDate: TODAY,
    deliveryDate: TODAY,
    invoiceOnAccountVatHigh: false,
    orderLines: [
      {
        description: `${invoiceLine} omitted VAT`,
        count: 1,
        unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
      },
    ],
  });

  const noVatTypeInvoice = await request<ApiValue<Invoice>>(
    "PUT",
    `order/${noVatTypeOrder.value.id}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`,
  );

  console.log(
    JSON.stringify(
      {
        apiCalls,
        seed,
        managerEmail: manager.email,
        customerId: createdCustomer.value.id,
        projectId: createdProject.value.id,
        projectFirstResolvedCustomerId: resolvedProject.customer.id,
        projectFirstResolvedStartDate: resolvedProject.startDate,
        updatedFixedPrice: updatedProject.value.fixedprice,
        vatTypes: (vatResponse.values ?? []).map((entry) => ({
          id: entry.id,
          percentage: entry.percentage,
          code: entry.code,
        })),
        partialAmount: PARTIAL_AMOUNT,
        explicitVatInvoice: explicitInvoice.value,
        omittedVatInvoice: noVatTypeInvoice.value,
      },
      null,
      2,
    ),
  );
}

await main();
