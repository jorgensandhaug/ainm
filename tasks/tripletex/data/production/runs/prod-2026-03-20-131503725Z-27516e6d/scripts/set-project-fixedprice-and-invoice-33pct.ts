const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "wigPQjdvaV7x7YGSZSHViwFDVVLkrPIXUEOY8bQMrlE";

const TODAY = "2026-03-20";
const CUSTOMER_NAME = "Brightstone Ltd";
const CUSTOMER_ORG_NO = "850116091";
const PROJECT_NAME = "Infrastructure Upgrade";
const PROJECT_MANAGER_EMAIL = "charlotte.walker@example.org";
const FIXED_PRICE = 170500;
const MILESTONE_PERCENT = 33;
const MILESTONE_AMOUNT = 56265;
const ORDER_LINE_DESCRIPTION = "Milestone payment 33% of fixed price for Infrastructure Upgrade";

type ListResponse<T> = {
  values?: T[];
  fullResultSize?: number;
};

type Wrapper<T> = {
  value?: T;
};

type Employee = {
  id: number;
  email?: string;
};

type Customer = {
  id: number;
  name?: string;
  organizationNumber?: string;
};

type VatType = {
  id: number;
  number?: number;
  percentage?: number;
  name?: string;
};

type Project = {
  id: number;
  version?: number;
  name?: string;
  startDate?: string;
  isClosed?: boolean;
  customer?: { id?: number };
  projectManager?: { id?: number };
  vatType?: { id?: number };
};

type Order = {
  id: number;
};

type Invoice = {
  id: number;
  customer?: { id?: number };
  amountExcludingVatCurrency?: number;
  amountCurrency?: number;
  amountCurrencyOutstanding?: number;
};

function authHeader(): string {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", authHeader());
  headers.set("Accept", "application/json");
  if (init.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    throw new Error(
      JSON.stringify(
        {
          method: init.method ?? "GET",
          path,
          status: response.status,
          body,
        },
        null,
        2,
      ),
    );
  }

  return body as T;
}

function exactEmailMatch(employees: Employee[], email: string): Employee | undefined {
  const target = email.trim().toLowerCase();
  return employees.find((employee) => employee.email?.trim().toLowerCase() === target);
}

function chooseProject(projects: Project[], customerId: number): Project | undefined {
  const exact = projects.filter(
    (project) =>
      project.name === PROJECT_NAME &&
      project.customer?.id === customerId,
  );

  return exact.find((project) => !project.isClosed) ?? exact[0];
}

function chooseVatType(vatTypes: VatType[], projectVatTypeId?: number): VatType {
  if (projectVatTypeId !== undefined) {
    const fromProject = vatTypes.find((vatType) => vatType.id === projectVatTypeId);
    if (fromProject) {
      return fromProject;
    }
  }

  const sorted = [...vatTypes].sort((a, b) => {
    const percentageDiff = (b.percentage ?? -Infinity) - (a.percentage ?? -Infinity);
    if (percentageDiff !== 0) return percentageDiff;
    return a.id - b.id;
  });

  const preferredPositive = sorted.find((vatType) => (vatType.percentage ?? 0) > 0);
  return preferredPositive ?? sorted[0];
}

async function main(): Promise<void> {
  const [employeeRes, customerRes, vatRes] = await Promise.all([
    request<ListResponse<Employee>>(
      `/employee?email=${encodeURIComponent(PROJECT_MANAGER_EMAIL)}&assignableProjectManagers=true&count=10&fields=*`,
    ),
    request<ListResponse<Customer>>(
      `/customer?organizationNumber=${encodeURIComponent(CUSTOMER_ORG_NO)}&count=10&fields=*`,
    ),
    request<ListResponse<VatType>>(
      `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`,
    ),
  ]);

  const projectManager = exactEmailMatch(employeeRes.values ?? [], PROJECT_MANAGER_EMAIL);
  if (!projectManager?.id) {
    throw new Error(`Assignable project manager not found for ${PROJECT_MANAGER_EMAIL}`);
  }

  const vatTypes = vatRes.values ?? [];
  if (vatTypes.length === 0) {
    throw new Error("No outgoing VAT types returned for invoice date");
  }

  let customer =
    (customerRes.values ?? []).find(
      (candidate) =>
        candidate.organizationNumber === CUSTOMER_ORG_NO &&
        (candidate.name === CUSTOMER_NAME || !candidate.name),
    ) ??
    (customerRes.values ?? []).find(
      (candidate) => candidate.organizationNumber === CUSTOMER_ORG_NO,
    );

  if (!customer?.id) {
    const createCustomerRes = await request<Wrapper<Customer>>("/customer", {
      method: "POST",
      body: JSON.stringify({
        name: CUSTOMER_NAME,
        organizationNumber: CUSTOMER_ORG_NO,
        invoiceSendMethod: "MANUAL",
      }),
    });
    customer = createCustomerRes.value;
  }

  if (!customer?.id) {
    throw new Error("Customer resolution failed");
  }

  const projectSearchRes = await request<ListResponse<Project>>(
    `/project?name=${encodeURIComponent(PROJECT_NAME)}&customerId=${customer.id}&count=50&fields=*`,
  );
  const existingProject = chooseProject(projectSearchRes.values ?? [], customer.id);

  const projectPayload = {
    ...(existingProject?.id ? { id: existingProject.id } : {}),
    ...(existingProject?.version !== undefined ? { version: existingProject.version } : {}),
    name: PROJECT_NAME,
    startDate: existingProject?.startDate ?? TODAY,
    customer: { id: customer.id },
    projectManager: { id: projectManager.id },
    isFixedPrice: true,
    fixedprice: FIXED_PRICE,
    invoiceOnAccountVatHigh: false,
  };

  const projectRes = existingProject?.id
    ? await request<Wrapper<Project>>(`/project/${existingProject.id}`, {
        method: "PUT",
        body: JSON.stringify(projectPayload),
      })
    : await request<Wrapper<Project>>("/project", {
        method: "POST",
        body: JSON.stringify(projectPayload),
      });

  const project = projectRes.value;
  if (!project?.id) {
    throw new Error("Project write did not return an id");
  }

  const vatType = chooseVatType(vatTypes, project.vatType?.id);

  const orderRes = await request<Wrapper<Order>>("/order", {
    method: "POST",
    body: JSON.stringify({
      customer: { id: customer.id },
      project: { id: project.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
      invoiceOnAccountVatHigh: false,
      orderLines: [
        {
          description: ORDER_LINE_DESCRIPTION,
          count: 1,
          unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
          vatType: { id: vatType.id },
        },
      ],
    }),
  });

  const order = orderRes.value;
  if (!order?.id) {
    throw new Error("Order creation did not return an id");
  }

  const invoiceRes = await request<Wrapper<Invoice>>(
    `/order/${order.id}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`,
    {
      method: "PUT",
    },
  );

  const invoice = invoiceRes.value;
  if (!invoice?.id) {
    throw new Error("Invoice creation did not return an id");
  }

  if (invoice.customer?.id !== customer.id) {
    throw new Error(`Invoice customer mismatch: expected ${customer.id}, got ${invoice.customer?.id}`);
  }

  if (invoice.amountExcludingVatCurrency !== MILESTONE_AMOUNT) {
    throw new Error(
      `Invoice amountExcludingVatCurrency mismatch: expected ${MILESTONE_AMOUNT}, got ${invoice.amountExcludingVatCurrency}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        customerId: customer.id,
        projectId: project.id,
        projectFixedPrice: FIXED_PRICE,
        milestonePercent: MILESTONE_PERCENT,
        milestoneAmount: MILESTONE_AMOUNT,
        vatTypeId: vatType.id,
        invoiceId: invoice.id,
        invoiceAmountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
        invoiceAmountCurrency: invoice.amountCurrency,
        invoiceAmountCurrencyOutstanding: invoice.amountCurrencyOutstanding,
      },
      null,
      2,
    ),
  );
}

await main();
