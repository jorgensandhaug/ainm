const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const TODAY = "2026-03-20";
const CUSTOMER_NAME = "Estrella SL";
const CUSTOMER_ORG_NO = "816896770";
const PROJECT_NAME = "Desarrollo e-commerce";
const PROJECT_MANAGER_NAME = "Laura Rodríguez";
const PROJECT_MANAGER_EMAIL = "laura.rodriguez@example.org";
const FALLBACK_MANAGER_EMAILS = [
  "laura.rodriguez@example.org",
  "kristian.nilsen@example.org",
  "finn.muller@example.org",
  "jonas.larsen@example.org",
];
const FIXED_PRICE = 375250;
const PARTIAL_AMOUNT = Number((FIXED_PRICE * 0.33).toFixed(2));
const LINE_DESCRIPTION = "Pago parcial del 33 % del precio fijo para Desarrollo e-commerce";

type QueryValue = string | number | boolean | null | undefined;

type ApiList<T> = {
  values?: T[];
  fullResultSize?: number;
};

type ApiValue<T> = {
  value: T;
};

type Employee = {
  id: number;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
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
  isClosed?: boolean | null;
  isFixedPrice?: boolean | null;
  fixedprice?: number | null;
  customer?: Customer | null;
  projectManager?: Employee | null;
};

type VatType = {
  id: number;
  percentage?: number | null;
};

type Order = {
  id: number;
};

type Invoice = {
  id: number;
  customer?: { id?: number | null } | null;
  amountExcludingVatCurrency?: number | null;
  amountCurrencyOutstanding?: number | null;
};

type FixtureManager = {
  id: number;
  email: string;
  name: string;
};

function authHeader() {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const url = new URL(path, BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.append(key, String(value));
    }
  }
  return url;
}

async function request<T>(
  method: string,
  path: string,
  options: {
    query?: Record<string, QueryValue>;
    body?: unknown;
  } = {},
): Promise<T> {
  const response = await fetch(buildUrl(path, options.query), {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json; charset=utf-8" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${method} ${path}${buildUrl("", options.query).search} -> ${response.status} ${JSON.stringify(body)}`);
  }

  return body as T;
}

function fullName(employee: Employee) {
  const combined = [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim();
  return combined || employee.name || "";
}

function chooseCustomer(values: Customer[]) {
  const orgMatches = values.filter((customer) => customer.organizationNumber === CUSTOMER_ORG_NO);
  if (orgMatches.length === 0) return null;
  if (orgMatches.length === 1) return orgMatches[0];
  const nameMatches = orgMatches.filter((customer) => customer.name === CUSTOMER_NAME);
  if (nameMatches.length === 1) return nameMatches[0];
  throw new Error(`Ambiguous customer for ${CUSTOMER_ORG_NO}`);
}

function chooseManager(values: Employee[]) {
  const emailMatches = values.filter((employee) => employee.email === PROJECT_MANAGER_EMAIL);
  if (emailMatches.length === 0) return null;
  if (emailMatches.length === 1) return emailMatches[0];
  const nameMatches = emailMatches.filter((employee) => fullName(employee) === PROJECT_MANAGER_NAME);
  if (nameMatches.length === 1) return nameMatches[0];
  throw new Error(`Ambiguous project manager for ${PROJECT_MANAGER_EMAIL}`);
}

function chooseProject(values: Project[]) {
  const exact = values.filter(
    (project) =>
      project.name === PROJECT_NAME &&
      project.customer?.organizationNumber === CUSTOMER_ORG_NO,
  );
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    const openMatches = exact.filter((project) => project.isClosed !== true);
    if (openMatches.length === 1) return openMatches[0];
    throw new Error(`Ambiguous project for ${PROJECT_NAME} / ${CUSTOMER_ORG_NO}`);
  }
  return null;
}

function chooseVatType(values: VatType[]) {
  const vat25 = values.find((vatType) => vatType.percentage === 25);
  if (vat25) return vat25;
  if (values.length === 1) return values[0];
  const zeroVatOnly = values.every((vatType) => vatType.percentage === 0);
  if (zeroVatOnly) {
    const vat0 = values.find((vatType) => vatType.percentage === 0);
    if (vat0) return vat0;
  }
  throw new Error("No decisive outgoing VAT type");
}

async function ensureFixture() {
  let projectManager: FixtureManager | null = null;
  for (const email of FALLBACK_MANAGER_EMAILS) {
    const employeeSearch = await request<ApiList<Employee>>("GET", "employee", {
      query: {
        email,
        assignableProjectManagers: true,
        count: 10,
        fields: "*",
      },
    });
    const manager =
      email === PROJECT_MANAGER_EMAIL
        ? chooseManager(employeeSearch.values ?? [])
        : (employeeSearch.values ?? []).find((employee) => employee.email === email) ?? null;
    if (manager?.email) {
      projectManager = {
        id: manager.id,
        email: manager.email,
        name: fullName(manager),
      };
      break;
    }
  }

  if (!projectManager) {
    const employeeSearch = await request<ApiList<Employee>>("GET", "employee", {
      query: {
        assignableProjectManagers: true,
        count: 100,
        fields: "*",
      },
    });
    const manager = (employeeSearch.values ?? []).find((employee) => employee.email);
    if (manager?.email) {
      projectManager = {
        id: manager.id,
        email: manager.email,
        name: fullName(manager),
      };
    }
  }

  if (!projectManager) {
    throw new Error("Missing sandbox fixture project manager");
  }

  let customer: Customer | null = null;
  const customerSearch = await request<ApiList<Customer>>("GET", "customer", {
    query: {
      organizationNumber: CUSTOMER_ORG_NO,
      count: 10,
      fields: "*",
    },
  });
  customer = chooseCustomer(customerSearch.values ?? []);
  if (!customer) {
    const createdCustomer = await request<ApiValue<Customer>>("POST", "customer", {
      body: {
        name: CUSTOMER_NAME,
        organizationNumber: CUSTOMER_ORG_NO,
        invoiceSendMethod: "MANUAL",
      },
    });
    customer = createdCustomer.value;
  }

  const projectSearch = await request<ApiList<Project>>("GET", "project", {
    query: {
      name: PROJECT_NAME,
      count: 50,
      fields: "*,customer(*),projectManager(*)",
    },
  });
  const existingProject = chooseProject(projectSearch.values ?? []);
  if (existingProject) {
    return {
      fixtureCreated: false,
      customerId: customer.id,
      projectManagerId: projectManager.id,
      projectManagerEmail: projectManager.email,
      projectId: existingProject.id,
    };
  }

  const createdProject = await request<ApiValue<Project>>("POST", "project", {
    body: {
      name: PROJECT_NAME,
      startDate: TODAY,
      customer: { id: customer.id },
      projectManager: { id: projectManager.id },
      isFixedPrice: true,
      fixedprice: 300000,
      invoiceOnAccountVatHigh: false,
    },
  });

  return {
    fixtureCreated: true,
    customerId: customer.id,
    projectManagerId: projectManager.id,
    projectManagerEmail: projectManager.email,
    projectId: createdProject.value.id,
  };
}

async function provePath(fixtureManagerEmail: string) {
  const projectSearch = await request<ApiList<Project>>("GET", "project", {
    query: {
      name: PROJECT_NAME,
      count: 50,
      fields: "*,customer(*),projectManager(*)",
    },
  });
  const existingProject = chooseProject(projectSearch.values ?? []);
  if (!existingProject) {
    throw new Error("Fixture project missing before proof");
  }
  if (existingProject.projectManager?.email !== fixtureManagerEmail) {
    throw new Error("Fixture project manager mismatch before proof");
  }

  const projectWrite = await request<ApiValue<Project>>("PUT", `project/${existingProject.id}`, {
    body: {
      name: PROJECT_NAME,
      startDate: existingProject.startDate || TODAY,
      customer: { id: existingProject.customer!.id },
      projectManager: { id: existingProject.projectManager!.id },
      isFixedPrice: true,
      fixedprice: FIXED_PRICE,
      invoiceOnAccountVatHigh: false,
    },
  });

  const vatSearch = await request<ApiList<VatType>>("GET", "ledger/vatType", {
    query: {
      typeOfVat: "OUTGOING",
      vatDate: TODAY,
      fields: "*",
    },
  });
  const vatType = chooseVatType(vatSearch.values ?? []);

  const orderWrite = await request<ApiValue<Order>>("POST", "order", {
    body: {
      customer: { id: existingProject.customer!.id },
      project: { id: existingProject.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
      invoiceOnAccountVatHigh: false,
      orderLines: [
        {
          description: LINE_DESCRIPTION,
          count: 1,
          unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
          vatType: { id: vatType.id },
        },
      ],
    },
  });

  const invoiceWrite = await request<ApiValue<Invoice>>("PUT", `order/${orderWrite.value.id}/:invoice`, {
    query: {
      invoiceDate: TODAY,
      sendToCustomer: false,
    },
  });

  return {
    callsMeasured: 5,
    projectId: projectWrite.value.id,
    orderId: orderWrite.value.id,
    invoiceId: invoiceWrite.value.id,
    amountExcludingVatCurrency: invoiceWrite.value.amountExcludingVatCurrency,
    amountCurrencyOutstanding: invoiceWrite.value.amountCurrencyOutstanding,
    vatTypeId: vatType.id,
    vatPercentage: vatType.percentage ?? null,
  };
}

async function main() {
  const fixture = await ensureFixture();
  const proof = await provePath(fixture.projectManagerEmail);
  console.log(JSON.stringify({ fixture, proof }, null, 2));
}

await main();
