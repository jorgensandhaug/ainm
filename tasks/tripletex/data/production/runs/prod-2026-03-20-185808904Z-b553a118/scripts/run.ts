const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "97-qC-J-pso5FxVqCFemk2UOxggMNbLkCCakLUIeqq4";

const TODAY = "2026-03-20";
const CUSTOMER_NAME = "Sonnental GmbH";
const CUSTOMER_ORG_NO = "877407047";
const PROJECT_NAME = "ERP-Implementierung";
const PROJECT_MANAGER_EMAIL = "finn.muller@example.org";
const PROJECT_MANAGER_NAME = "Finn Müller";
const FIXED_PRICE = 350650;
const PARTIAL_AMOUNT = Number((FIXED_PRICE * 0.25).toFixed(2));
const LINE_DESCRIPTION = "Meilensteinzahlung 25 % des Festpreises für ERP-Implementierung";

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
};

type VatType = {
  id: number;
  percentage?: number | null;
};

type LedgerAccount = {
  id: number;
  number?: number | string | null;
  bankAccountNumber?: string | null;
  isInvoiceAccount?: boolean | null;
  isBankAccount?: boolean | null;
  description?: string | null;
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

function authHeader() {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

function endpoint(path: string) {
  return new URL(path, BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`).toString();
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
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

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function exactEmailMatches(values: Employee[]) {
  return values.filter((employee) => employee.email === PROJECT_MANAGER_EMAIL);
}

function employeeFullName(employee: Employee) {
  const combined = [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim();
  return combined || employee.name || "";
}

function resolveEmployee(values: Employee[]) {
  const exact = exactEmailMatches(values);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    const nameMatches = exact.filter((employee) => employeeFullName(employee) === PROJECT_MANAGER_NAME);
    if (nameMatches.length === 1) return nameMatches[0];
    throw new Error(`Ambiguous employee match for ${PROJECT_MANAGER_EMAIL}`);
  }
  throw new Error(`Project manager not found for ${PROJECT_MANAGER_EMAIL}`);
}

function resolveCustomer(values: Customer[]) {
  const exactOrg = values.filter((customer) => customer.organizationNumber === CUSTOMER_ORG_NO);
  if (exactOrg.length === 0) return null;
  if (exactOrg.length === 1) return exactOrg[0];
  const exactName = exactOrg.filter((customer) => customer.name === CUSTOMER_NAME);
  if (exactName.length === 1) return exactName[0];
  throw new Error(`Ambiguous customer match for ${CUSTOMER_ORG_NO}`);
}

function resolveProject(values: Project[]) {
  const exactName = values.filter((project) => project.name === PROJECT_NAME);
  if (exactName.length === 0) return null;
  if (exactName.length === 1) return exactName[0];
  throw new Error(`Ambiguous project match for ${PROJECT_NAME}`);
}

function resolveVatType(values: VatType[]) {
  const vat25 = values.find((vatType) => vatType.percentage === 25);
  if (vat25) return vat25;
  if (values.length === 1) return values[0];
  const vat0 = values.find((vatType) => vatType.percentage === 0);
  if (vat0 && values.every((vatType) => vatType.percentage === 0)) return vat0;
  throw new Error("No decisive outgoing VAT type found");
}

function chooseInvoiceBankAccount(values: LedgerAccount[]) {
  const invoiceAccount = values.find((account) => account.isInvoiceAccount);
  if (invoiceAccount) return invoiceAccount;
  const account1920 = values.find((account) => String(account.number) === "1920");
  if (account1920) return account1920;
  if (values.length === 1) return values[0];
  throw new Error("No decisive invoice bank account found");
}

function makeValidBankAccountNumber() {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  for (let seq = 3200000000; seq < 3299999999; seq += 1) {
    const prefix = String(seq);
    const sum = prefix
      .split("")
      .reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    const check = remainder === 0 ? 0 : 11 - remainder;
    if (check < 10) return `${prefix}${check}`;
  }
  throw new Error("Failed to generate valid bank account number");
}

async function main() {
  const employeeResponse = await request<ApiList<Employee>>(
    "GET",
    `employee?email=${encodeURIComponent(PROJECT_MANAGER_EMAIL)}&assignableProjectManagers=true&count=10&fields=*`,
  );
  const employee = resolveEmployee(employeeResponse.values ?? []);

  const customerResponse = await request<ApiList<Customer>>(
    "GET",
    `customer?organizationNumber=${encodeURIComponent(CUSTOMER_ORG_NO)}&count=10&fields=*`,
  );
  let customer = resolveCustomer(customerResponse.values ?? []);

  if (!customer) {
    const createdCustomer = await request<ApiValue<Customer>>("POST", "customer", {
      name: CUSTOMER_NAME,
      organizationNumber: CUSTOMER_ORG_NO,
      invoiceSendMethod: "MANUAL",
    });
    customer = createdCustomer.value;
  }

  const projectResponse = await request<ApiList<Project>>(
    "GET",
    `project?name=${encodeURIComponent(PROJECT_NAME)}&customerId=${customer.id}&count=50&fields=*`,
  );
  const existingProject = resolveProject(projectResponse.values ?? []);
  const projectPayload = {
    name: PROJECT_NAME,
    startDate: existingProject?.startDate || TODAY,
    customer: { id: customer.id },
    projectManager: { id: employee.id },
    isFixedPrice: true,
    fixedprice: FIXED_PRICE,
    invoiceOnAccountVatHigh: false,
  };

  const projectResponseValue = existingProject
    ? await request<ApiValue<Project>>("PUT", `project/${existingProject.id}`, projectPayload)
    : await request<ApiValue<Project>>("POST", "project", projectPayload);
  const project = projectResponseValue.value;

  const vatResponse = await request<ApiList<VatType>>(
    "GET",
    `ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`,
  );
  const vatType = resolveVatType(vatResponse.values ?? []);

  const orderResponse = await request<ApiValue<Order>>("POST", "order", {
    customer: { id: customer.id },
    project: { id: project.id },
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
  });
  const order = orderResponse.value;

  const ledgerAccountResponse = await request<ApiList<LedgerAccount>>(
    "GET",
    "ledger/account?isBankAccount=true&fields=*",
  );
  const invoiceBankAccount = chooseInvoiceBankAccount(ledgerAccountResponse.values ?? []);

  if (!invoiceBankAccount.bankAccountNumber) {
    await request<ApiValue<LedgerAccount>>(`PUT`, `ledger/account/${invoiceBankAccount.id}`, {
      bankAccountNumber: makeValidBankAccountNumber(),
    });
  }

  const invoiceResponse = await request<ApiValue<Invoice>>(
    "PUT",
    `order/${order.id}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`,
  );

  const invoice = invoiceResponse.value;
  if (invoice.amountExcludingVatCurrency !== PARTIAL_AMOUNT) {
    throw new Error(
      `Unexpected invoice amountExcludingVatCurrency: ${invoice.amountExcludingVatCurrency} != ${PARTIAL_AMOUNT}`,
    );
  }
}

await main();
