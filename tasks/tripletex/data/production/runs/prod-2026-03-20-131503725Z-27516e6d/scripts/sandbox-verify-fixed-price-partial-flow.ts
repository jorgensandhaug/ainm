const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const TODAY = "2026-03-20";
const CUSTOMER_NAME = "Brightstone Ltd";
const CUSTOMER_ORG_NO = "850116091";
const FIXED_PRICE = 170500;
const INITIAL_FIXED_PRICE = 170400;
const MILESTONE_AMOUNT = 56265;
const PREFERRED_PM_EMAIL = "charlotte.walker@example.org";
const PROJECT_NAME = "Infrastructure Upgrade Postrun Verify 27516e6d";
const BANK_ACCOUNT_NUMBER = "12345678903";

type ListResponse<T> = {
  values?: T[];
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
  percentage?: number;
};

type Project = {
  id: number;
  version?: number;
  name?: string;
  startDate?: string;
  vatType?: { id?: number };
};

type Order = {
  id: number;
};

type Account = {
  id: number;
  version?: number;
  number?: number;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
  isInactive?: boolean;
  bankAccountNumber?: string;
};

type Invoice = {
  id: number;
  amountExcludingVatCurrency?: number;
  amountCurrency?: number;
  amountCurrencyOutstanding?: number;
  customer?: {
    id?: number;
    organizationNumber?: string;
  };
  orders?: Array<{
    project?: {
      id?: number;
      name?: string;
      isFixedPrice?: boolean;
      fixedprice?: number;
      projectManager?: { email?: string };
      customer?: { organizationNumber?: string };
    };
    orderLines?: Array<{
      unitPriceExcludingVatCurrency?: number;
      amountExcludingVatCurrency?: number;
    }>;
  }>;
};

function authHeader(): string {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
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
    throw Object.assign(
      new Error(
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
      ),
      {
        status: response.status,
        body,
        path,
      },
    );
  }

  return body as T;
}

function chooseProjectManager(employees: Employee[]): Employee | undefined {
  const preferred = employees.find(
    (employee) => employee.email?.trim().toLowerCase() === PREFERRED_PM_EMAIL,
  );
  return preferred ?? employees[0];
}

function chooseVatType(vatTypes: VatType[], projectVatTypeId?: number): VatType {
  if (projectVatTypeId !== undefined) {
    const fromProject = vatTypes.find((vatType) => vatType.id === projectVatTypeId);
    if (fromProject) return fromProject;
  }

  const sorted = [...vatTypes].sort((a, b) => {
    const pctDiff = (b.percentage ?? -Infinity) - (a.percentage ?? -Infinity);
    if (pctDiff !== 0) return pctDiff;
    return a.id - b.id;
  });

  return sorted.find((vatType) => (vatType.percentage ?? 0) > 0) ?? sorted[0];
}

function chooseBankAccount(accounts: Account[]): Account | undefined {
  const active = accounts.filter((account) => !account.isInactive && account.isBankAccount);
  return (
    active.find((account) => account.isInvoiceAccount && account.number === 1920) ??
    active.find((account) => account.isInvoiceAccount) ??
    active[0]
  );
}

function isMissingBankAccountError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  try {
    const parsed = JSON.parse(error.message);
    const messages = parsed?.body?.validationMessages;
    return Array.isArray(messages)
      ? messages.some((item: { message?: string }) =>
          item.message?.includes("registrert et bankkontonummer"),
        )
      : false;
  } catch {
    return false;
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const [employeeRes, customerRes, vatRes] = await Promise.all([
    request<ListResponse<Employee>>(
      `/employee?assignableProjectManagers=true&count=50&fields=*`,
    ),
    request<ListResponse<Customer>>(
      `/customer?organizationNumber=${encodeURIComponent(CUSTOMER_ORG_NO)}&count=10&fields=*`,
    ),
    request<ListResponse<VatType>>(
      `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`,
    ),
  ]);

  const projectManager = chooseProjectManager(employeeRes.values ?? []);
  assert(projectManager?.id, "No assignable project manager available");

  let customer =
    (customerRes.values ?? []).find(
      (candidate) => candidate.organizationNumber === CUSTOMER_ORG_NO,
    ) ?? null;

  let createdCustomer = false;
  if (!customer?.id) {
    const customerCreateRes = await request<Wrapper<Customer>>("/customer", {
      method: "POST",
      body: JSON.stringify({
        name: CUSTOMER_NAME,
        organizationNumber: CUSTOMER_ORG_NO,
        invoiceSendMethod: "MANUAL",
      }),
    });
    customer = customerCreateRes.value ?? null;
    createdCustomer = true;
  }
  assert(customer?.id, "Customer resolution failed");

  const vatTypes = vatRes.values ?? [];
  assert(vatTypes.length > 0, "No valid outgoing VAT types returned");

  const projectCreateRes = await request<Wrapper<Project>>("/project", {
    method: "POST",
    body: JSON.stringify({
      name: PROJECT_NAME,
      startDate: TODAY,
      customer: { id: customer.id },
      projectManager: { id: projectManager.id },
      isFixedPrice: true,
      fixedprice: INITIAL_FIXED_PRICE,
      invoiceOnAccountVatHigh: false,
    }),
  });
  const createdProject = projectCreateRes.value;
  assert(createdProject?.id, "Project creation failed");

  const projectUpdateRes = await request<Wrapper<Project>>(`/project/${createdProject.id}`, {
    method: "PUT",
    body: JSON.stringify({
      id: createdProject.id,
      ...(createdProject.version !== undefined ? { version: createdProject.version } : {}),
      name: PROJECT_NAME,
      startDate: createdProject.startDate ?? TODAY,
      customer: { id: customer.id },
      projectManager: { id: projectManager.id },
      isFixedPrice: true,
      fixedprice: FIXED_PRICE,
      invoiceOnAccountVatHigh: false,
    }),
  });
  const project = projectUpdateRes.value;
  assert(project?.id, "Project update failed");

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
          description: "Milestone payment 33% of fixed price",
          count: 1,
          unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
          vatType: { id: vatType.id },
        },
      ],
    }),
  });
  const order = orderRes.value;
  assert(order?.id, "Order creation failed");

  let repairedBankAccount = false;
  let invoiceRes: Wrapper<Invoice>;

  try {
    invoiceRes = await request<Wrapper<Invoice>>(
      `/order/${order.id}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`,
      { method: "PUT" },
    );
  } catch (error) {
    if (!isMissingBankAccountError(error)) throw error;

    const accountsRes = await request<ListResponse<Account>>(
      "/ledger/account?isBankAccount=true&fields=*",
    );
    const account = chooseBankAccount(accountsRes.values ?? []);
    assert(account?.id, "No invoice-capable bank account available for repair");

    await request<Wrapper<Account>>(`/ledger/account/${account.id}`, {
      method: "PUT",
      body: JSON.stringify({
        id: account.id,
        ...(account.version !== undefined ? { version: account.version } : {}),
        bankAccountNumber: BANK_ACCOUNT_NUMBER,
      }),
    });

    repairedBankAccount = true;
    invoiceRes = await request<Wrapper<Invoice>>(
      `/order/${order.id}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`,
      { method: "PUT" },
    );
  }

  const invoice = invoiceRes.value;
  assert(invoice?.id, "Invoice creation failed");

  const fields =
    "*,customer(*),orders(*,project(*,customer(*),projectManager(*)),orderLines(*)),orderLines(*)";
  const verifyRes = await request<Wrapper<Invoice>>(
    `/invoice/${invoice.id}?fields=${encodeURIComponent(fields)}`,
  );
  const verified = verifyRes.value;

  assert(verified?.amountExcludingVatCurrency === MILESTONE_AMOUNT, "Invoice amount mismatch");
  assert(verified.customer?.organizationNumber === CUSTOMER_ORG_NO, "Invoice customer mismatch");

  const verifiedProject = verified.orders?.[0]?.project;
  assert(verifiedProject?.id === project.id, "Invoice project link mismatch");
  assert(verifiedProject.name === PROJECT_NAME, "Project name mismatch");
  assert(verifiedProject.isFixedPrice === true, "Project fixed-price flag mismatch");
  assert(verifiedProject.fixedprice === FIXED_PRICE, "Project fixed-price amount mismatch");
  assert(
    verifiedProject.projectManager?.email === projectManager.email,
    "Project manager mismatch",
  );

  const verifiedLine = verified.orders?.[0]?.orderLines?.[0] ?? verified.orderLines?.[0];
  assert(
    verifiedLine?.unitPriceExcludingVatCurrency === MILESTONE_AMOUNT ||
      verifiedLine?.amountExcludingVatCurrency === MILESTONE_AMOUNT,
    "Order line amount mismatch",
  );

  console.log(
    JSON.stringify(
      {
        createdCustomer,
        repairedBankAccount,
        projectManagerEmail: projectManager.email,
        customerId: customer.id,
        projectId: project.id,
        orderId: order.id,
        invoiceId: invoice.id,
        invoiceAmountExcludingVatCurrency: verified.amountExcludingVatCurrency,
        projectFixedPrice: verifiedProject.fixedprice,
      },
      null,
      2,
    ),
  );
}

await main();
