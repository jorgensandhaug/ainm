const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "xijMGVvLWp2Q_CJvoPHvREmq4YfqAEjV22xSOYCNGxk";

const TODAY = "2026-03-20";
const CUSTOMER_NAME = "Estrella SL";
const CUSTOMER_ORG_NO = "816896770";
const PROJECT_NAME = "Desarrollo e-commerce";
const PROJECT_MANAGER_NAME = "Laura Rodríguez";
const PROJECT_MANAGER_EMAIL = "laura.rodriguez@example.org";
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

type LedgerAccount = {
  id: number;
  number?: number | string | null;
  bankAccountNumber?: string | null;
  isInvoiceAccount?: boolean | null;
};

class ApiError extends Error {
  status: number;
  body: unknown;
  path: string;

  constructor(method: string, path: string, status: number, body: unknown) {
    super(`${method} ${path} -> ${status}`);
    this.status = status;
    this.body = body;
    this.path = path;
  }
}

function parseBody(text: string) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

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
  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers: {
        Authorization: authHeader(),
        Accept: "application/json",
        ...(options.body === undefined ? {} : { "Content-Type": "application/json; charset=utf-8" }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    throw new Error(`Blocked: network failure for ${method} ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const text = await response.text();
  const body = parseBody(text);

  if (!response.ok) {
    if (
      response.status === 403 &&
      body &&
      typeof body === "object" &&
      "error" in body &&
      (body as { error?: string }).error === "Invalid or expired token"
    ) {
      throw new Error("Blocked: invalid or expired token");
    }
    throw new ApiError(method, `${path}${buildUrl("", options.query).search}`, response.status, body ?? text);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return body as T;
}

function fullName(employee: Employee) {
  const combined = [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim();
  return combined || employee.name || "";
}

function exactOne<T>(values: T[], predicate: (value: T) => boolean, label: string) {
  const matches = values.filter(predicate);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  throw new Error(`Ambiguous ${label}: ${matches.length} exact matches`);
}

function chooseProject(values: Project[]) {
  const exact = values.filter(
    (project) =>
      project.name === PROJECT_NAME &&
      project.customer?.organizationNumber === CUSTOMER_ORG_NO,
  );
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    const openExact = exact.filter((project) => project.isClosed !== true);
    if (openExact.length === 1) return openExact[0];
    throw new Error(`Ambiguous project for ${PROJECT_NAME} / ${CUSTOMER_ORG_NO}`);
  }
  return null;
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

function collectStrings(input: unknown, acc: string[] = []): string[] {
  if (typeof input === "string") {
    acc.push(input);
    return acc;
  }
  if (Array.isArray(input)) {
    for (const value of input) collectStrings(value, acc);
    return acc;
  }
  if (input && typeof input === "object") {
    for (const value of Object.values(input)) collectStrings(value, acc);
  }
  return acc;
}

function isMissingBankAccountError(error: unknown) {
  if (!(error instanceof ApiError) || error.status !== 422) return false;
  return collectStrings(error.body).some((message) =>
    message.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer."),
  );
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
  for (let seq = 3210000000; seq < 3299999999; seq += 1) {
    const prefix = String(seq);
    const sum = prefix
      .split("")
      .reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    const checkDigit = remainder === 0 ? 0 : 11 - remainder;
    if (checkDigit < 10) return `${prefix}${checkDigit}`;
  }
  throw new Error("Unable to generate valid bank account number");
}

async function main() {
  const projectSearch = await request<ApiList<Project>>("GET", "project", {
    query: {
      name: PROJECT_NAME,
      count: 50,
      fields: "*,customer(*),projectManager(*)",
    },
  });

  const existingProject = chooseProject(projectSearch.values ?? []);
  let customer = existingProject?.customer ?? null;
  let projectManager = existingProject?.projectManager?.email === PROJECT_MANAGER_EMAIL
    ? existingProject.projectManager
    : null;

  if (!customer) {
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
  }

  if (!projectManager) {
    const employeeSearch = await request<ApiList<Employee>>("GET", "employee", {
      query: {
        email: PROJECT_MANAGER_EMAIL,
        assignableProjectManagers: true,
        count: 10,
        fields: "*",
      },
    });
    projectManager = chooseManager(employeeSearch.values ?? []);
    if (!projectManager) {
      throw new Error(`Project manager not found for ${PROJECT_MANAGER_EMAIL}`);
    }
  }

  const projectPayload = {
    name: PROJECT_NAME,
    startDate: existingProject?.startDate || TODAY,
    customer: { id: customer.id },
    projectManager: { id: projectManager.id },
    isFixedPrice: true,
    fixedprice: FIXED_PRICE,
    invoiceOnAccountVatHigh: false,
  };

  const projectWrite = existingProject
    ? await request<ApiValue<Project>>("PUT", `project/${existingProject.id}`, {
        body: projectPayload,
      })
    : await request<ApiValue<Project>>("POST", "project", {
        body: projectPayload,
      });
  const project = projectWrite.value;

  if (
    project.name !== PROJECT_NAME ||
    project.customer?.id !== customer.id ||
    project.projectManager?.id !== projectManager.id ||
    project.isFixedPrice !== true ||
    Number(project.fixedprice) !== FIXED_PRICE
  ) {
    throw new Error(`Project write verification failed: ${JSON.stringify(project, null, 2)}`);
  }

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
    },
  });
  const order = orderWrite.value;

  let invoiceWrite: ApiValue<Invoice>;
  try {
    invoiceWrite = await request<ApiValue<Invoice>>("PUT", `order/${order.id}/:invoice`, {
      query: {
        invoiceDate: TODAY,
        sendToCustomer: false,
      },
    });
  } catch (error) {
    if (!isMissingBankAccountError(error)) throw error;

    const ledgerAccounts = await request<ApiList<LedgerAccount>>("GET", "ledger/account", {
      query: {
        isBankAccount: true,
        fields: "*",
      },
    });
    const invoiceBankAccount = chooseInvoiceBankAccount(ledgerAccounts.values ?? []);

    if (invoiceBankAccount.bankAccountNumber) {
      throw error;
    }

    await request<ApiValue<LedgerAccount>>("PUT", `ledger/account/${invoiceBankAccount.id}`, {
      body: {
        bankAccountNumber: makeValidBankAccountNumber(),
      },
    });

    invoiceWrite = await request<ApiValue<Invoice>>("PUT", `order/${order.id}/:invoice`, {
      query: {
        invoiceDate: TODAY,
        sendToCustomer: false,
      },
    });
  }

  const invoice = invoiceWrite.value;
  if (invoice.customer?.id !== customer.id) {
    throw new Error(`Invoice customer mismatch: ${JSON.stringify(invoice, null, 2)}`);
  }
  if (Number(invoice.amountExcludingVatCurrency) !== PARTIAL_AMOUNT) {
    throw new Error(
      `Invoice amount mismatch: ${invoice.amountExcludingVatCurrency} !== ${PARTIAL_AMOUNT}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        customerId: customer.id,
        projectManagerId: projectManager.id,
        projectId: project.id,
        orderId: order.id,
        invoiceId: invoice.id,
        amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
        amountCurrencyOutstanding: invoice.amountCurrencyOutstanding,
      },
      null,
      2,
    ),
  );
}

await main();
