const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "aOOg8Yt5wKNIyH9qIoSWgSdhNWKNnS957m1MCsr6Pds";

const RUN_DATE = "2026-03-20";
const CUSTOMER_NAME = "Soleil SARL";
const CUSTOMER_ORG_NO = "931336738";
const PROJECT_NAME = "Mise à niveau infrastructure";
const PROJECT_MANAGER_EMAIL = "nathan.thomas@example.org";
const FIXED_PRICE = 125550;
const PARTIAL_AMOUNT = Number((FIXED_PRICE * 0.25).toFixed(2));
const ORDER_LINE_DESCRIPTION = "Paiement d'étape 25 % du prix forfaitaire";

type QueryValue = string | number | boolean | null | undefined;

type ApiList<T> = {
  values?: T[];
  fullResultSize?: number;
};

type ApiValue<T> = {
  value: T;
};

type Customer = {
  id: number;
  name?: string | null;
  organizationNumber?: string | null;
};

type Employee = {
  id: number;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
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
  method: string;
  path: string;

  constructor(method: string, path: string, status: number, body: unknown) {
    super(`${method} ${path} -> ${status}`);
    this.status = status;
    this.body = body;
    this.method = method;
    this.path = path;
  }
}

function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function authHeader(): string {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`, "utf8").toString("base64")}`;
}

function buildUrl(path: string, query?: Record<string, QueryValue>): URL {
  const url = new URL(path.replace(/^\//, ""), BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`);
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
    throw new Error(
      `Blocked: network failure for ${method} ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const text = await response.text();
  const body = parseBody(text);

  if (!response.ok) {
    const errorText =
      body && typeof body === "object" && "error" in body && typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : "";
    if (
      response.status === 403 &&
      (errorText === "Invalid or expired token" ||
        errorText ===
          "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.")
    ) {
      throw new Error(`Blocked: ${errorText}`);
    }
    throw new ApiError(method, path, response.status, body ?? text);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return body as T;
}

function fullName(employee: Employee): string {
  const combined = [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim();
  return combined || employee.name || "";
}

function chooseProject(values: Project[]): Project | null {
  const exact = values.filter(
    (project) =>
      project.name === PROJECT_NAME &&
      project.customer?.organizationNumber === CUSTOMER_ORG_NO,
  );
  if (exact.length === 0) return null;
  if (exact.length === 1) return exact[0];

  const exactManager = exact.filter(
    (project) => project.projectManager?.email === PROJECT_MANAGER_EMAIL,
  );
  if (exactManager.length === 1) return exactManager[0];

  const open = exact.filter((project) => project.isClosed !== true);
  if (open.length === 1) return open[0];

  throw new Error(`Ambiguous project for ${PROJECT_NAME} / ${CUSTOMER_ORG_NO}`);
}

function chooseCustomer(values: Customer[]): Customer | null {
  const orgMatches = values.filter((customer) => customer.organizationNumber === CUSTOMER_ORG_NO);
  if (orgMatches.length === 0) return null;
  if (orgMatches.length === 1) return orgMatches[0];

  const exactName = orgMatches.filter((customer) => customer.name === CUSTOMER_NAME);
  if (exactName.length === 1) return exactName[0];

  throw new Error(`Ambiguous customer for ${CUSTOMER_ORG_NO}`);
}

function chooseManager(values: Employee[]): Employee | null {
  const emailMatches = values.filter((employee) => employee.email === PROJECT_MANAGER_EMAIL);
  if (emailMatches.length === 0) return null;
  if (emailMatches.length === 1) return emailMatches[0];

  const exactName = emailMatches.filter((employee) => fullName(employee) === "Nathan Thomas");
  if (exactName.length === 1) return exactName[0];

  throw new Error(`Ambiguous project manager for ${PROJECT_MANAGER_EMAIL}`);
}

function chooseVatType(values: VatType[]): VatType {
  const vat25 = values.find((vatType) => Number(vatType.percentage) === 25);
  if (vat25) return vat25;
  if (values.length === 1) return values[0];

  const zeroVat = values.filter((vatType) => Number(vatType.percentage) === 0);
  if (zeroVat.length === 1 && zeroVat.length === values.length) return zeroVat[0];

  throw new Error(`No decisive outgoing VAT type: ${JSON.stringify(values)}`);
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

function isMissingBankAccountError(error: unknown): error is ApiError {
  if (!(error instanceof ApiError) || error.status !== 422) return false;
  return collectStrings(error.body).some((message) =>
    message.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer."),
  );
}

function chooseInvoiceBankAccount(values: LedgerAccount[]): LedgerAccount {
  const invoiceAccount = values.find((account) => account.isInvoiceAccount);
  if (invoiceAccount) return invoiceAccount;

  const account1920 = values.find((account) => String(account.number) === "1920");
  if (account1920) return account1920;

  if (values.length === 1) return values[0];

  throw new Error("No decisive invoice bank account found");
}

function makeValidBankAccountNumber(existingNumbers: Set<string>): string {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  for (let prefixNum = 3210000000; prefixNum < 3299999999; prefixNum += 1) {
    const prefix = String(prefixNum);
    const sum = prefix
      .split("")
      .reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    const checkDigit = remainder === 0 ? 0 : 11 - remainder;
    if (checkDigit >= 10) continue;
    const candidate = `${prefix}${checkDigit}`;
    if (!existingNumbers.has(candidate)) return candidate;
  }
  throw new Error("Unable to generate valid bank account number");
}

async function main(): Promise<void> {
  const projectSearch = await request<ApiList<Project>>("GET", "project", {
    query: {
      name: PROJECT_NAME,
      count: 50,
      fields: "*,customer(*),projectManager(*)",
    },
  });

  const existingProject = chooseProject(projectSearch.values ?? []);
  let customer = existingProject?.customer ?? null;
  let projectManager =
    existingProject?.projectManager?.email === PROJECT_MANAGER_EMAIL
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
    startDate: existingProject?.startDate || RUN_DATE,
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
    project.customer?.id !== customer.id ||
    project.projectManager?.id !== projectManager.id ||
    project.isFixedPrice !== true ||
    Number(project.fixedprice) !== FIXED_PRICE
  ) {
    throw new Error(`Project write verification failed: ${JSON.stringify(project)}`);
  }

  const vatSearch = await request<ApiList<VatType>>("GET", "ledger/vatType", {
    query: {
      typeOfVat: "OUTGOING",
      vatDate: RUN_DATE,
      fields: "*",
    },
  });
  const vatType = chooseVatType(vatSearch.values ?? []);

  const orderWrite = await request<ApiValue<Order>>("POST", "order", {
    body: {
      customer: { id: customer.id },
      project: { id: project.id },
      orderDate: RUN_DATE,
      deliveryDate: RUN_DATE,
      invoiceOnAccountVatHigh: false,
      orderLines: [
        {
          description: ORDER_LINE_DESCRIPTION,
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
        invoiceDate: RUN_DATE,
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

    const existingNumbers = new Set(
      (ledgerAccounts.values ?? [])
        .map((account) => String(account.bankAccountNumber ?? "").trim())
        .filter((value) => /^\d{11}$/.test(value)),
    );
    const bankAccountNumber = makeValidBankAccountNumber(existingNumbers);

    await request<ApiValue<LedgerAccount>>("PUT", `ledger/account/${invoiceBankAccount.id}`, {
      body: {
        bankAccountNumber,
      },
    });

    invoiceWrite = await request<ApiValue<Invoice>>("PUT", `order/${order.id}/:invoice`, {
      query: {
        invoiceDate: RUN_DATE,
        sendToCustomer: false,
      },
    });
  }

  const invoice = invoiceWrite.value;
  if (invoice.customer?.id !== customer.id) {
    throw new Error(`Invoice customer mismatch: ${JSON.stringify(invoice)}`);
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
        fixedprice: project.fixedprice,
        amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
        amountCurrencyOutstanding: invoice.amountCurrencyOutstanding,
      },
      null,
      2,
    ),
  );
}

await main();
