const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const TODAY = "2026-03-20";
const TARGET_FIXED_PRICE = 473250;
const INITIAL_FIXED_PRICE = 470000;
const MILESTONE_AMOUNT = 118312.5;
const RUN_TAG = "2498866c";
const CUSTOMER_NAME = `Windkraft Reflection ${RUN_TAG} GmbH`;
const CUSTOMER_ORG = `9992498${RUN_TAG.slice(0, 2)}`;
const PROJECT_NAME = `Datensicherheit Reflection ${RUN_TAG}`;

type WrappedList<T> = { values?: T[] };
type WrappedValue<T> = { value?: T };

type Customer = { id: number; name?: string; organizationNumber?: string };
type Employee = { id: number; email?: string };
type Project = {
  id: number;
  name?: string;
  startDate?: string;
  fixedprice?: number;
  customer?: Customer | null;
  projectManager?: Employee | null;
};
type VatType = { id: number; percentage?: number };
type Order = { id: number };

type CallLog = {
  method: string;
  path: string;
  status: number;
};

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(path, `${BASE_URL}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.append(key, String(value));
    }
  }
  return url.toString();
}

async function request<T>(
  calls: CallLog[],
  method: string,
  path: string,
  opts: { query?: Record<string, string | number | boolean | undefined>; body?: unknown } = {},
) {
  const res = await fetch(buildUrl(path, opts.query), {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const raw = await res.text();
  let data: T | null = null;
  if (raw) data = JSON.parse(raw) as T;
  calls.push({ method, path, status: res.status });
  if (!res.ok) throw new Error(`${method} ${path} failed (${res.status}): ${raw}`);
  return data;
}

function exact<T>(items: T[], pred: (value: T) => boolean, label: string): T {
  const matches = items.filter(pred);
  if (matches.length !== 1) throw new Error(`${label}: expected 1, got ${matches.length}`);
  return matches[0];
}

async function resolveManager(): Promise<Employee> {
  const exactCalls: CallLog[] = [];
  const exactSearch = await request<WrappedList<Employee>>(exactCalls, "GET", "employee", {
    query: {
      email: "maximilian.wagner@example.org",
      assignableProjectManagers: true,
      count: 10,
      fields: "*",
    },
  });
  const exactMatches = (exactSearch.values ?? []).filter(
    (employee) => employee.email === "maximilian.wagner@example.org",
  );
  if (exactMatches.length === 1) return exactMatches[0];

  const fallbackCalls: CallLog[] = [];
  const managerSearch = await request<WrappedList<Employee>>(fallbackCalls, "GET", "employee", {
    query: {
      assignableProjectManagers: true,
      count: 10,
      fields: "*",
    },
  });
  const manager = (managerSearch.values ?? []).find((employee) => employee.email);
  if (!manager) throw new Error("No assignable sandbox project manager found");
  return manager;
}

async function ensureFixture(manager: Employee) {
  const calls: CallLog[] = [];

  let customerSearch = await request<WrappedList<Customer>>(calls, "GET", "customer", {
    query: {
      organizationNumber: CUSTOMER_ORG,
      count: 10,
      fields: "*",
    },
  });
  let customer = (customerSearch.values ?? []).find(
    (value) => value.organizationNumber === CUSTOMER_ORG && value.name === CUSTOMER_NAME,
  );
  if (!customer) {
    const created = await request<WrappedValue<Customer>>(calls, "POST", "customer", {
      body: {
        name: CUSTOMER_NAME,
        organizationNumber: CUSTOMER_ORG,
        invoiceSendMethod: "MANUAL",
      },
    });
    if (!created.value) throw new Error("Customer create missing value");
    customer = created.value;
  }

  const projectSearch = await request<WrappedList<Project>>(calls, "GET", "project", {
    query: {
      name: PROJECT_NAME,
      count: 50,
      fields: "*,customer(*),projectManager(*)",
    },
  });
  let project = (projectSearch.values ?? []).find(
    (value) =>
      value.name === PROJECT_NAME &&
      value.customer?.organizationNumber === CUSTOMER_ORG &&
      value.projectManager?.email === manager.email,
  );

  if (!project) {
    const created = await request<WrappedValue<Project>>(calls, "POST", "project", {
      body: {
        name: PROJECT_NAME,
        startDate: TODAY,
        customer: { id: customer.id },
        projectManager: { id: manager.id },
        isFixedPrice: true,
        fixedprice: INITIAL_FIXED_PRICE,
        invoiceOnAccountVatHigh: false,
      },
    });
    if (!created.value) throw new Error("Project create missing value");
    project = created.value;
  } else if (Number(project.fixedprice) !== INITIAL_FIXED_PRICE) {
    const updated = await request<WrappedValue<Project>>(calls, "PUT", `project/${project.id}`, {
      body: {
        name: PROJECT_NAME,
        startDate: project.startDate ?? TODAY,
        customer: { id: customer.id },
        projectManager: { id: manager.id },
        isFixedPrice: true,
        fixedprice: INITIAL_FIXED_PRICE,
        invoiceOnAccountVatHigh: false,
      },
    });
    if (!updated.value) throw new Error("Project reset missing value");
    project = updated.value;
  }

  return {
    customerId: customer.id,
    manager,
    projectId: project.id,
    projectStartDate: project.startDate ?? TODAY,
    setupCalls: calls,
  };
}

async function resolveVat(calls: CallLog) {
  void calls;
}

async function measureUpdateNeeded(fixture: {
  customerId: number;
  projectId: number;
  projectStartDate: string;
  manager: Employee;
}) {
  const calls: CallLog[] = [];

  const projectSearch = await request<WrappedList<Project>>(calls, "GET", "project", {
    query: {
      name: PROJECT_NAME,
      count: 50,
      fields: "*,customer(*),projectManager(*)",
    },
  });
  const project = exact(
    projectSearch.values ?? [],
    (value) =>
      value.name === PROJECT_NAME &&
      value.customer?.organizationNumber === CUSTOMER_ORG &&
      value.projectManager?.email === fixture.manager.email,
    "update-needed project",
  );

  const updatedProject = await request<WrappedValue<Project>>(calls, "PUT", `project/${project.id}`, {
    body: {
      name: PROJECT_NAME,
      startDate: project.startDate ?? fixture.projectStartDate,
      customer: { id: fixture.customerId },
      projectManager: { id: fixture.manager.id },
      isFixedPrice: true,
      fixedprice: TARGET_FIXED_PRICE,
      invoiceOnAccountVatHigh: false,
    },
  });
  if (!updatedProject.value) throw new Error("Update-needed PUT /project missing value");

  const vatSearch = await request<WrappedList<VatType>>(calls, "GET", "ledger/vatType", {
    query: {
      typeOfVat: "OUTGOING",
      vatDate: TODAY,
      fields: "*",
    },
  });
  const vat = (vatSearch.values ?? []).find((value) => Number(value.percentage) === 25) ??
    exact(vatSearch.values ?? [], (value) => Number(value.percentage) === 0, "sandbox vat");

  const order = await request<WrappedValue<Order>>(calls, "POST", "order", {
    body: {
      customer: { id: fixture.customerId },
      project: { id: fixture.projectId },
      orderDate: TODAY,
      deliveryDate: TODAY,
      invoiceOnAccountVatHigh: false,
      orderLines: [
        {
          description: "Sandbox proof update-needed 25% milestone",
          count: 1,
          unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
          vatType: { id: vat.id },
        },
      ],
    },
  });
  if (!order.value?.id) throw new Error("Update-needed POST /order missing id");

  const invoice = await request<WrappedValue<Record<string, unknown>>>(
    calls,
    "PUT",
    `order/${order.value.id}/:invoice`,
    {
      query: {
        invoiceDate: TODAY,
        sendToCustomer: false,
      },
    },
  );
  return { calls, invoice: invoice.value };
}

async function measureSkipPut(fixture: {
  customerId: number;
  projectId: number;
  manager: Employee;
}) {
  const calls: CallLog[] = [];

  const projectSearch = await request<WrappedList<Project>>(calls, "GET", "project", {
    query: {
      name: PROJECT_NAME,
      count: 50,
      fields: "*,customer(*),projectManager(*)",
    },
  });
  const project = exact(
    projectSearch.values ?? [],
    (value) =>
      value.name === PROJECT_NAME &&
      value.customer?.organizationNumber === CUSTOMER_ORG &&
      value.projectManager?.email === fixture.manager.email &&
      Number(value.fixedprice) === TARGET_FIXED_PRICE,
    "skip-put project",
  );

  const vatSearch = await request<WrappedList<VatType>>(calls, "GET", "ledger/vatType", {
    query: {
      typeOfVat: "OUTGOING",
      vatDate: TODAY,
      fields: "*",
    },
  });
  const vat = (vatSearch.values ?? []).find((value) => Number(value.percentage) === 25) ??
    exact(vatSearch.values ?? [], (value) => Number(value.percentage) === 0, "sandbox vat");

  const order = await request<WrappedValue<Order>>(calls, "POST", "order", {
    body: {
      customer: { id: fixture.customerId },
      project: { id: project.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
      invoiceOnAccountVatHigh: false,
      orderLines: [
        {
          description: "Sandbox proof skip-put 25% milestone",
          count: 1,
          unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
          vatType: { id: vat.id },
        },
      ],
    },
  });
  if (!order.value?.id) throw new Error("Skip-put POST /order missing id");

  const invoice = await request<WrappedValue<Record<string, unknown>>>(
    calls,
    "PUT",
    `order/${order.value.id}/:invoice`,
    {
      query: {
        invoiceDate: TODAY,
        sendToCustomer: false,
      },
    },
  );
  return { calls, invoice: invoice.value };
}

const manager = await resolveManager();
const fixture = await ensureFixture(manager);
const updateNeeded = await measureUpdateNeeded(fixture);
const skipPut = await measureSkipPut(fixture);

console.log(
  JSON.stringify(
    {
      fixture: {
        customerName: CUSTOMER_NAME,
        customerOrg: CUSTOMER_ORG,
        projectName: PROJECT_NAME,
        managerEmail: manager.email,
        setupCallCount: fixture.setupCalls.length,
      },
      updateNeeded: {
        callCount: updateNeeded.calls.length,
        calls: updateNeeded.calls,
        amountExcludingVatCurrency: updateNeeded.invoice?.["amountExcludingVatCurrency"],
        amountCurrencyOutstanding: updateNeeded.invoice?.["amountCurrencyOutstanding"],
      },
      skipPut: {
        callCount: skipPut.calls.length,
        calls: skipPut.calls,
        amountExcludingVatCurrency: skipPut.invoice?.["amountExcludingVatCurrency"],
        amountCurrencyOutstanding: skipPut.invoice?.["amountCurrencyOutstanding"],
      },
    },
    null,
    2,
  ),
);
