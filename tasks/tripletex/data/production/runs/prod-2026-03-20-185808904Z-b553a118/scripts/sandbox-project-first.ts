const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const TODAY = "2026-03-20";

type ApiList<T> = { values?: T[]; fullResultSize?: number };
type ApiValue<T> = { value: T };

type Employee = {
  id: number;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
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
  projectManager?: Employee | null;
  fixedprice?: number | null;
};

type VatType = {
  id: number;
  percentage?: number | null;
};

type Order = { id: number };

type Invoice = {
  id: number;
  amountExcludingVatCurrency?: number | null;
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

function makeOrgNumber(seed: string) {
  const digits = seed.replace(/\D/g, "").padEnd(8, "0").slice(0, 8);
  return `87${digits.slice(0, 7)}`;
}

async function setupFixture() {
  const seed = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const customerName = `Codex PF ${seed} GmbH`;
  const customerOrg = makeOrgNumber(seed);
  const projectName = `ERP PF ${seed}`;

  const employees = await request<ApiList<Employee>>(
    "GET",
    "employee?assignableProjectManagers=true&count=50&fields=*",
  );
  const manager = (employees.values ?? []).find((employee) => employee.email);
  if (!manager?.email) throw new Error("No assignable project manager found");

  const customer = await request<ApiValue<Customer>>("POST", "customer", {
    name: customerName,
    organizationNumber: customerOrg,
    invoiceSendMethod: "MANUAL",
  });

  const project = await request<ApiValue<Project>>("POST", "project", {
    name: projectName,
    startDate: TODAY,
    customer: { id: customer.value.id },
    projectManager: { id: manager.id },
    isFixedPrice: true,
    fixedprice: 300000,
    invoiceOnAccountVatHigh: false,
  });

  return {
    customerName,
    customerOrg,
    customerId: customer.value.id,
    projectName,
    projectId: project.value.id,
    manager,
  };
}

async function runProjectFirstFlow(fixture: Awaited<ReturnType<typeof setupFixture>>) {
  const startCalls = apiCalls;
  const projectRead = await request<ApiList<Project>>(
    "GET",
    `project?name=${encodeURIComponent(fixture.projectName)}&count=50&fields=*,customer(*),projectManager(*)`,
  );
  const project = (projectRead.values ?? []).find(
    (entry) =>
      entry.name === fixture.projectName &&
      entry.customer?.organizationNumber === fixture.customerOrg &&
      entry.projectManager?.email === fixture.manager.email,
  );
  if (!project?.customer?.id || !project.projectManager?.id || !project.startDate) {
    throw new Error("Project-first resolver missing nested customer/projectManager/startDate");
  }

  const updatedProject = await request<ApiValue<Project>>("PUT", `project/${project.id}`, {
    name: fixture.projectName,
    startDate: project.startDate,
    customer: { id: project.customer.id },
    projectManager: { id: project.projectManager.id },
    isFixedPrice: true,
    fixedprice: 350650,
    invoiceOnAccountVatHigh: false,
  });

  const vat = await request<ApiList<VatType>>(
    "GET",
    `ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`,
  );
  const vatType = (vat.values ?? []).find((entry) => entry.percentage === 25) ?? (vat.values ?? [])[0];
  if (!vatType) throw new Error("No VAT type found");

  const order = await request<ApiValue<Order>>("POST", "order", {
    customer: { id: project.customer.id },
    project: { id: project.id },
    orderDate: TODAY,
    deliveryDate: TODAY,
    invoiceOnAccountVatHigh: false,
    orderLines: [
      {
        description: "Milestone 25% project-first",
        count: 1,
        unitPriceExcludingVatCurrency: 87662.5,
        vatType: { id: vatType.id },
      },
    ],
  });

  const invoice = await request<ApiValue<Invoice>>(
    "PUT",
    `order/${order.value.id}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`,
  );

  return {
    calls: apiCalls - startCalls,
    projectReadValues: projectRead.values?.length ?? 0,
    resolvedProject: {
      id: project.id,
      customerId: project.customer.id,
      customerOrg: project.customer.organizationNumber,
      projectManagerId: project.projectManager.id,
      projectManagerEmail: project.projectManager.email,
      startDate: project.startDate,
    },
    updatedFixedPrice: updatedProject.value.fixedprice,
    invoice: invoice.value,
  };
}

const fixture = await setupFixture();
const projectFirst = await runProjectFirstFlow(fixture);

console.log(
  JSON.stringify(
    {
      totalApiCalls: apiCalls,
      fixture,
      projectFirst,
    },
    null,
    2,
  ),
);
