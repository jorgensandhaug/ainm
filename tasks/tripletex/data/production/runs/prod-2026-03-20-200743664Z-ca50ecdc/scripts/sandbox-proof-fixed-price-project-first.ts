const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const TODAY = "2026-03-20";
const INITIAL_FIXED_PRICE = 180000;
const TARGET_FIXED_PRICE = 181650;
const PARTIAL_AMOUNT = 90825;

type ApiList<T> = {
  values?: T[];
};

type ApiValue<T> = {
  value?: T;
};

type Employee = {
  id: number;
  email?: string | null;
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
  isFixedPrice?: boolean | null;
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
  amountExcludingVatCurrency?: number | null;
  amountCurrencyOutstanding?: number | null;
  customer?: { id?: number | null } | null;
};

type LedgerAccount = {
  id: number;
  number?: number | null;
  bankAccountNumber?: string | null;
  isBankAccount?: boolean | null;
  isInvoiceAccount?: boolean | null;
};

let apiCalls = 0;

function endpoint(path: string): string {
  return new URL(path, BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`).toString();
}

function authHeader(): string {
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

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    throw new Error(
      JSON.stringify(
        {
          method,
          path,
          status: response.status,
          body: parsed,
        },
        null,
        2,
      ),
    );
  }

  return parsed as T;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makeOrgNumber(seed: string): string {
  const digits = seed.replace(/\D/g, "").padEnd(7, "0").slice(0, 7);
  return `87${digits}`;
}

function pickVatType(vatTypes: VatType[]): VatType {
  return vatTypes.find((vatType) => Number(vatType.percentage) === 25) ?? vatTypes[0];
}

async function findInvoiceBankAccount(): Promise<LedgerAccount> {
  const response = await request<ApiList<LedgerAccount>>(
    "GET",
    "ledger/account?isBankAccount=true&fields=*",
  );
  const accounts = response.values ?? [];
  const account =
    accounts.find((entry) => entry.isInvoiceAccount === true) ??
    accounts.find((entry) => entry.number === 1920) ??
    accounts.find((entry) => entry.isBankAccount === true);
  assert(account?.id, "No bank account available");
  return account;
}

async function setupFixture() {
  const seed = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const projectName = `Project-first proof ${seed}`;
  const customerName = `Project-first proof ${seed} AS`;
  const customerOrg = makeOrgNumber(seed);

  const employees = await request<ApiList<Employee>>(
    "GET",
    "employee?assignableProjectManagers=true&count=50&fields=*",
  );
  const manager = (employees.values ?? []).find((entry) => entry.email);
  assert(manager?.id && manager.email, "No assignable project manager with email");

  const customer = await request<ApiValue<Customer>>("POST", "customer", {
    name: customerName,
    organizationNumber: customerOrg,
    invoiceSendMethod: "MANUAL",
  });
  assert(customer.value?.id, "Customer create failed");

  const project = await request<ApiValue<Project>>("POST", "project", {
    name: projectName,
    startDate: TODAY,
    customer: { id: customer.value.id },
    projectManager: { id: manager.id },
    isFixedPrice: true,
    fixedprice: INITIAL_FIXED_PRICE,
    invoiceOnAccountVatHigh: false,
  });
  assert(project.value?.id, "Project create failed");

  return {
    projectName,
    customerOrg,
    customerId: customer.value.id,
    managerId: manager.id,
    managerEmail: manager.email,
    projectId: project.value.id,
  };
}

async function proveFiveCallFlow(fixture: Awaited<ReturnType<typeof setupFixture>>) {
  const startCalls = apiCalls;

  const projectRead = await request<ApiList<Project>>(
    "GET",
    `project?name=${encodeURIComponent(fixture.projectName)}&count=50&fields=*,customer(*),projectManager(*)`,
  );
  const resolvedProject = (projectRead.values ?? []).find(
    (entry) =>
      entry.name === fixture.projectName &&
      entry.customer?.organizationNumber === fixture.customerOrg &&
      entry.projectManager?.email === fixture.managerEmail,
  );
  assert(
    resolvedProject?.id &&
      resolvedProject.customer?.id &&
      resolvedProject.projectManager?.id &&
      resolvedProject.startDate,
    "Project-first resolver did not return enough nested data",
  );

  const projectUpdate = await request<ApiValue<Project>>(
    "PUT",
    `project/${resolvedProject.id}`,
    {
      name: fixture.projectName,
      startDate: resolvedProject.startDate,
      customer: { id: resolvedProject.customer.id },
      projectManager: { id: resolvedProject.projectManager.id },
      isFixedPrice: true,
      fixedprice: TARGET_FIXED_PRICE,
      invoiceOnAccountVatHigh: false,
    },
  );
  assert(projectUpdate.value?.fixedprice === TARGET_FIXED_PRICE, "Project update mismatch");

  const vatResponse = await request<ApiList<VatType>>(
    "GET",
    `ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`,
  );
  const vatType = pickVatType(vatResponse.values ?? []);
  assert(vatType?.id, "No VAT type returned");

  const order = await request<ApiValue<Order>>("POST", "order", {
    customer: { id: resolvedProject.customer.id },
    project: { id: resolvedProject.id },
    orderDate: TODAY,
    deliveryDate: TODAY,
    invoiceOnAccountVatHigh: false,
    orderLines: [
      {
        description: "Delbetaling 50 % av fastpris",
        count: 1,
        unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
        vatType: { id: vatType.id },
      },
    ],
  });
  assert(order.value?.id, "Order create failed");

  const invoice = await request<ApiValue<Invoice>>(
    "PUT",
    `order/${order.value.id}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`,
  );
  assert(invoice.value?.id, "Invoice write failed");
  assert(
    Number(invoice.value.amountExcludingVatCurrency) === PARTIAL_AMOUNT,
    "Invoice amount mismatch",
  );

  return {
    measuredCalls: apiCalls - startCalls,
    projectId: resolvedProject.id,
    orderId: order.value.id,
    invoiceId: invoice.value.id,
    amountExcludingVatCurrency: invoice.value.amountExcludingVatCurrency,
    amountCurrencyOutstanding: invoice.value.amountCurrencyOutstanding,
  };
}

const bankAccount = await findInvoiceBankAccount();
const fixture = await setupFixture();
const proof = await proveFiveCallFlow(fixture);

console.log(
  JSON.stringify(
    {
      totalApiCalls: apiCalls,
      bankAccount: {
        id: bankAccount.id,
        number: bankAccount.number,
        isInvoiceAccount: bankAccount.isInvoiceAccount ?? false,
        bankAccountNumber: bankAccount.bankAccountNumber ?? null,
      },
      fixture,
      proof,
    },
    null,
    2,
  ),
);
