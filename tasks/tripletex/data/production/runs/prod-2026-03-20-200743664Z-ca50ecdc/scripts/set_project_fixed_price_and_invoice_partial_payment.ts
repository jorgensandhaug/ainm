const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "idO92nQDOduzKJRTGbScgvhDfznUM4auRGlG0lceRz4";

const CUSTOMER_NAME = "Tindra AS";
const CUSTOMER_ORG_NO = "870827946";
const PROJECT_NAME = "Nettbutikk-utvikling";
const PROJECT_MANAGER_EMAIL = "kristian.nilsen@example.org";
const RUN_DATE = "2026-03-20";
const FIXED_PRICE = 181650;
const PARTIAL_FACTOR = 0.5;
const PARTIAL_AMOUNT = Number((FIXED_PRICE * PARTIAL_FACTOR).toFixed(2));
const ORDER_LINE_DESCRIPTION = "Delbetaling 50 % av fastpris";

const authHeader =
  "Basic " + Buffer.from(`0:${SESSION_TOKEN}`, "utf8").toString("base64");

class ApiError extends Error {
  status: number;
  text: string;
  body: unknown;

  constructor(status: number, text: string, body: unknown) {
    super(`HTTP ${status}: ${text}`);
    this.status = status;
    this.text = text;
    this.body = body;
  }
}

type EntityRef = {
  id?: number;
};

type Customer = EntityRef & {
  name?: string;
  organizationNumber?: string;
};

type Employee = EntityRef & {
  email?: string;
};

type Project = EntityRef & {
  name?: string;
  startDate?: string;
  customer?: Customer | null;
  projectManager?: Employee | null;
  fixedprice?: number;
  isFixedPrice?: boolean;
};

type VatType = EntityRef & {
  percentage?: number;
};

type LedgerAccount = EntityRef & {
  number?: number;
  bankAccountNumber?: string | null;
  isInvoiceAccount?: boolean;
  isBankAccount?: boolean;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorText(body: unknown, fallback = ""): string {
  if (typeof body === "string") return body;
  if (!isObject(body)) return fallback;

  const parts: string[] = [];
  for (const key of [
    "error",
    "message",
    "errorMessage",
    "developerMessage",
    "fullMessage",
    "fullMessages",
  ]) {
    const value = body[key];
    if (typeof value === "string") parts.push(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") parts.push(item);
        else if (isObject(item)) {
          const nested = errorText(item, "");
          if (nested) parts.push(nested);
        }
      }
    }
  }

  const validationMessages = body.validationMessages;
  if (Array.isArray(validationMessages)) {
    for (const item of validationMessages) {
      if (!isObject(item)) continue;
      const field = typeof item.field === "string" ? item.field : "";
      const message =
        typeof item.message === "string"
          ? item.message
          : typeof item.description === "string"
            ? item.description
            : "";
      if (field || message) parts.push(`${field}: ${message}`.trim());
    }
  }

  return parts.filter(Boolean).join(" | ") || fallback;
}

function buildUrl(path: string): string {
  const normalizedBase = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  return new URL(path.replace(/^\//, ""), normalizedBase).toString();
}

async function api<T>(
  path: string,
  init: RequestInit,
  expectedStatus: number | number[],
): Promise<T> {
  const response = await fetch(buildUrl(path), {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? safeJsonParse(text) : null;
  const allowed = Array.isArray(expectedStatus)
    ? expectedStatus
    : [expectedStatus];

  if (!allowed.includes(response.status)) {
    throw new ApiError(response.status, text, body);
  }

  return body as T;
}

function unwrapValue<T>(body: unknown): T {
  if (!isObject(body) || !("value" in body)) {
    throw new Error(`Unexpected response wrapper: ${JSON.stringify(body)}`);
  }
  return body.value as T;
}

function unwrapValues<T>(body: unknown): T[] {
  if (!isObject(body) || !Array.isArray(body.values)) {
    throw new Error(`Unexpected list wrapper: ${JSON.stringify(body)}`);
  }
  return body.values as T[];
}

function customerOrgMatch(customer: Customer | null | undefined): boolean {
  return customer?.organizationNumber === CUSTOMER_ORG_NO;
}

function exactCustomerMatch(customer: Customer | null | undefined): boolean {
  return customerOrgMatch(customer) && customer?.name === CUSTOMER_NAME;
}

function exactProjectManagerMatch(
  employee: Employee | null | undefined,
): boolean {
  return employee?.email === PROJECT_MANAGER_EMAIL;
}

function pickSingle<T>(items: T[], label: string): T {
  if (items.length !== 1) {
    throw new Error(`${label}: expected 1 match, got ${items.length}`);
  }
  return items[0];
}

function pickVatType(vatTypes: VatType[]): VatType {
  const exact25 = vatTypes.find((vatType) => Number(vatType.percentage) === 25);
  if (exact25) return exact25;
  if (vatTypes.length === 1) return vatTypes[0];
  throw new Error(
    `Could not resolve a valid outgoing VAT type from ${JSON.stringify(vatTypes)}`,
  );
}

function computeCheckDigit(first10: string): string | null {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = first10
    .split("")
    .reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0);
  const remainder = sum % 11;
  const check = 11 - remainder;
  if (check === 11) return "0";
  if (check === 10) return null;
  return String(check);
}

function generateBankAccountNumber(existing: Set<string>): string {
  for (let i = 1234500000; i <= 1234599999; i++) {
    const first10 = String(i);
    const checkDigit = computeCheckDigit(first10);
    if (!checkDigit) continue;
    const candidate = `${first10}${checkDigit}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error("Could not generate a unique bank account number");
}

async function resolveProject(): Promise<Project[]> {
  const response = await api<{ values?: Project[] }>(
    `/project?name=${encodeURIComponent(PROJECT_NAME)}&count=50&fields=*,customer(*),projectManager(*)`,
    { method: "GET" },
    200,
  );
  return unwrapValues<Project>(response).filter(
    (project) => project.name === PROJECT_NAME,
  );
}

async function resolveCustomer(): Promise<Customer> {
  const response = await api<{ values?: Customer[] }>(
    `/customer?organizationNumber=${encodeURIComponent(CUSTOMER_ORG_NO)}&count=10&fields=*`,
    { method: "GET" },
    200,
  );
  const customers = unwrapValues<Customer>(response);
  const exactMatches = customers.filter(exactCustomerMatch);
  if (exactMatches.length > 0) return pickSingle(exactMatches, "customer exact match");

  const orgMatches = customers.filter(customerOrgMatch);
  if (orgMatches.length === 1) return orgMatches[0];
  if (orgMatches.length > 1) {
    throw new Error(`customer ambiguous for org ${CUSTOMER_ORG_NO}`);
  }

  const created = await api<{ value?: Customer }>(
    "customer",
    {
      method: "POST",
      body: JSON.stringify({
        name: CUSTOMER_NAME,
        organizationNumber: CUSTOMER_ORG_NO,
        invoiceSendMethod: "MANUAL",
      }),
    },
    201,
  );
  const customer = unwrapValue<Customer>(created);
  if (!customer.id || customer.organizationNumber !== CUSTOMER_ORG_NO) {
    throw new Error(`Unexpected customer create response: ${JSON.stringify(customer)}`);
  }
  return customer;
}

async function resolveProjectManager(): Promise<Employee> {
  const response = await api<{ values?: Employee[] }>(
    `/employee?email=${encodeURIComponent(PROJECT_MANAGER_EMAIL)}&assignableProjectManagers=true&count=10&fields=*`,
    { method: "GET" },
    200,
  );
  const matches = unwrapValues<Employee>(response).filter(exactProjectManagerMatch);
  return pickSingle(matches, "project manager exact match");
}

async function upsertProject(
  existingProject: Project | null,
  customerId: number,
  projectManagerId: number,
  startDate: string,
): Promise<Project> {
  const payload = {
    name: PROJECT_NAME,
    startDate,
    customer: { id: customerId },
    projectManager: { id: projectManagerId },
    isFixedPrice: true,
    fixedprice: FIXED_PRICE,
    invoiceOnAccountVatHigh: false,
  };

  const response = await api<{ value?: Project }>(
    existingProject ? `project/${existingProject.id}` : "project",
    {
      method: existingProject ? "PUT" : "POST",
      body: JSON.stringify(payload),
    },
    existingProject ? 200 : 201,
  );
  const project = unwrapValue<Project>(response);
  if (
    !project.id ||
    project.customer?.id !== customerId ||
    project.projectManager?.id !== projectManagerId ||
    project.isFixedPrice !== true ||
    Number(project.fixedprice) !== FIXED_PRICE
  ) {
    throw new Error(`Unexpected project write response: ${JSON.stringify(project)}`);
  }
  return project;
}

async function resolveVatTypeId(): Promise<number> {
  const response = await api<{ values?: VatType[] }>(
    `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${RUN_DATE}&fields=*`,
    { method: "GET" },
    200,
  );
  const vatType = pickVatType(unwrapValues<VatType>(response));
  if (!vatType.id) {
    throw new Error(`VAT type missing id: ${JSON.stringify(vatType)}`);
  }
  return vatType.id;
}

async function createOrder(customerId: number, projectId: number, vatTypeId: number) {
  const response = await api<{ value?: EntityRef }>(
    "order",
    {
      method: "POST",
      body: JSON.stringify({
        customer: { id: customerId },
        project: { id: projectId },
        orderDate: RUN_DATE,
        deliveryDate: RUN_DATE,
        invoiceOnAccountVatHigh: false,
        orderLines: [
          {
            description: ORDER_LINE_DESCRIPTION,
            count: 1,
            unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
            vatType: { id: vatTypeId },
          },
        ],
      }),
    },
    201,
  );
  const order = unwrapValue<EntityRef>(response);
  if (!order.id) {
    throw new Error(`Unexpected order create response: ${JSON.stringify(order)}`);
  }
  return order.id;
}

async function ensureCompanyInvoiceBankAccount(): Promise<void> {
  const response = await api<{ values?: LedgerAccount[] }>(
    "/ledger/account?isBankAccount=true&fields=*",
    { method: "GET" },
    200,
  );
  const accounts = unwrapValues<LedgerAccount>(response);
  const invoiceAccount =
    accounts.find((account) => account.isInvoiceAccount === true) ??
    accounts.find((account) => account.number === 1920) ??
    accounts.find((account) => account.isBankAccount === true);

  if (!invoiceAccount?.id) {
    throw new Error(`Could not resolve invoice bank account from ${JSON.stringify(accounts)}`);
  }

  if (invoiceAccount.bankAccountNumber) return;

  const existingNumbers = new Set(
    accounts
      .map((account) => account.bankAccountNumber)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  );
  const bankAccountNumber = generateBankAccountNumber(existingNumbers);

  await api(
    `ledger/account/${invoiceAccount.id}`,
    {
      method: "PUT",
      body: JSON.stringify({ bankAccountNumber }),
    },
    200,
  );
}

async function invoiceOrder(orderId: number, customerId: number) {
  const response = await api<{ value?: Record<string, unknown> }>(
    `order/${orderId}/:invoice?invoiceDate=${RUN_DATE}&sendToCustomer=false`,
    { method: "PUT" },
    200,
  );
  const invoice = unwrapValue<Record<string, unknown>>(response);
  const invoiceCustomer = isObject(invoice.customer)
    ? (invoice.customer as EntityRef)
    : null;
  if (
    typeof invoice.id !== "number" ||
    invoiceCustomer?.id !== customerId ||
    Number(invoice.amountExcludingVatCurrency) !== PARTIAL_AMOUNT
  ) {
    throw new Error(`Unexpected invoice write response: ${JSON.stringify(invoice)}`);
  }
  return invoice;
}

async function main(): Promise<void> {
  try {
    const projectMatches = await resolveProject();
    const orgProjectMatches = projectMatches.filter((project) =>
      customerOrgMatch(project.customer),
    );
    const exactProjectMatches = orgProjectMatches.filter((project) =>
      exactCustomerMatch(project.customer),
    );

    let existingProject: Project | null = null;
    let customer: Customer;
    let projectManager: Employee;
    let startDate = RUN_DATE;

    if (exactProjectMatches.length > 0 || orgProjectMatches.length > 0) {
      existingProject =
        exactProjectMatches.length > 0
          ? pickSingle(exactProjectMatches, "project exact match")
          : pickSingle(orgProjectMatches, "project org match");
      if (!existingProject.id || !existingProject.customer?.id) {
        throw new Error(`Exact project match missing ids: ${JSON.stringify(existingProject)}`);
      }
      customer = existingProject.customer;
      startDate = existingProject.startDate ?? RUN_DATE;
      if (exactProjectManagerMatch(existingProject.projectManager)) {
        if (!existingProject.projectManager?.id) {
          throw new Error(
            `Exact project match missing project manager id: ${JSON.stringify(existingProject)}`,
          );
        }
        projectManager = existingProject.projectManager;
      } else {
        projectManager = await resolveProjectManager();
      }
    } else {
      customer = await resolveCustomer();
      projectManager = await resolveProjectManager();
    }

    if (!customer.id) {
      throw new Error(`Resolved customer missing id: ${JSON.stringify(customer)}`);
    }
    if (!projectManager.id) {
      throw new Error(
        `Resolved project manager missing id: ${JSON.stringify(projectManager)}`,
      );
    }

    const project = await upsertProject(
      existingProject,
      customer.id,
      projectManager.id,
      startDate,
    );
    const vatTypeId = await resolveVatTypeId();
    const orderId = await createOrder(customer.id, project.id!, vatTypeId);
    await ensureCompanyInvoiceBankAccount();
    const invoice = await invoiceOrder(orderId, customer.id);

    console.log(
      JSON.stringify(
        {
          projectId: project.id,
          customerId: customer.id,
          projectManagerId: projectManager.id,
          fixedprice: project.fixedprice,
          orderId,
          invoiceId: invoice.id,
          amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
          amountCurrencyOutstanding: invoice.amountCurrencyOutstanding,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (error instanceof ApiError) {
      const text = errorText(error.body, error.text);
      if (error.status === 403 && text.includes("Invalid or expired token")) {
        throw new Error(`Blocked: invalid or expired token`);
      }
      throw new Error(`Tripletex API failed (${error.status}): ${text}`);
    }
    throw error;
  }
}

await main();
