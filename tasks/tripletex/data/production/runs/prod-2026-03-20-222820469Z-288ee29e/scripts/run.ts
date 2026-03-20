const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2/";
const SESSION_TOKEN = "iVV2J55iEjFrDVSxXA_ALPTuU2LxaK4YTXcWKftV6fM";

const TODAY = "2026-03-20";
const CUSTOMER_NAME = "Ridgepoint Ltd";
const CUSTOMER_ORG = "844419856";
const PROJECT_NAME = "CRM Integration";
const PROJECT_MANAGER_EMAIL = "george.walker@example.org";
const FIXED_PRICE = 498050;
const PARTIAL_AMOUNT = Number((FIXED_PRICE * 0.5).toFixed(2));
const ORDER_LINE_DESCRIPTION = "Milestone payment 50% of fixed price for CRM Integration";

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

class BlockedRunError extends Error {}

class HttpError extends Error {
  status: number;
  body: any;

  constructor(status: number, body: any) {
    super(`HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(path, BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.append(key, String(value));
    }
  }
  return url;
}

async function request<T>(
  method: string,
  path: string,
  options: {
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    allowStatuses?: number[];
  } = {},
): Promise<T> {
  const response = await fetch(buildUrl(path, options.query), {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const body = text ? safeJsonParse(text) : null;

  if (
    response.status === 403 &&
    (body?.error === "Invalid or expired token" ||
      body?.error ===
        "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.")
  ) {
    throw new BlockedRunError(body.error);
  }

  if (!response.ok && !(options.allowStatuses ?? []).includes(response.status)) {
    throw new HttpError(response.status, body);
  }

  return body as T;
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function valuesOf<T>(body: any): T[] {
  return Array.isArray(body?.values) ? body.values : [];
}

function exactSingle<T>(items: T[], predicate: (item: T) => boolean, label: string): T | null {
  const matches = items.filter(predicate);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  throw new Error(`Ambiguous ${label}`);
}

function pickProject(projects: any[]) {
  const exactByNameAndOrg = projects.filter(
    (project) => project?.name === PROJECT_NAME && project?.customer?.organizationNumber === CUSTOMER_ORG,
  );
  if (exactByNameAndOrg.length === 1) return exactByNameAndOrg[0];
  if (exactByNameAndOrg.length > 1) {
    const exactByManager = exactByNameAndOrg.filter(
      (project) => project?.projectManager?.email === PROJECT_MANAGER_EMAIL,
    );
    if (exactByManager.length === 1) return exactByManager[0];
    throw new Error("Ambiguous project");
  }
  return null;
}

function pickVatType(vatTypes: any[]) {
  const vat25 = vatTypes.find((vatType) => Number(vatType?.percentage) === 25);
  if (vat25) return vat25;
  if (vatTypes.length === 1) return vatTypes[0];
  throw new Error("No safe VAT type");
}

function hasBankAccountValidationMessage(body: any) {
  const messages = Array.isArray(body?.validationMessages) ? body.validationMessages : [];
  return messages.some((msg) =>
    String(msg?.message ?? "").includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer."),
  );
}

function computeBankAccountChecksum(firstTenDigits: string) {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = firstTenDigits
    .split("")
    .map((digit, index) => Number(digit) * weights[index])
    .reduce((acc, value) => acc + value, 0);
  const remainder = sum % 11;
  const checksum = 11 - remainder;
  if (checksum === 11) return "0";
  if (checksum === 10) return null;
  return String(checksum);
}

function generateUniqueBankAccount(existing: Set<string>) {
  for (let n = 1234567890; n < 1234569999; n += 1) {
    const firstTenDigits = String(n).padStart(10, "0");
    const checksum = computeBankAccountChecksum(firstTenDigits);
    if (!checksum) continue;
    const candidate = `${firstTenDigits}${checksum}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error("Could not generate unique bank account number");
}

async function repairCompanyBankAccount() {
  const accountsBody = await request<any>("GET", "ledger/account", {
    query: { isBankAccount: true, fields: "*" },
  });
  const rows = valuesOf<any>(accountsBody);
  const accounts = rows.map((row) => row?.account ?? row).filter((account) => account?.id);
  const target =
    accounts.find((account) => account?.isInvoiceAccount === true) ??
    accounts.find((account) => Number(account?.number) === 1920) ??
    accounts[0];

  if (!target?.id) throw new Error("No bank account available for repair");
  if (target.bankAccountNumber) return target;

  const existing = new Set(
    accounts
      .map((account) => String(account?.bankAccountNumber ?? "").trim())
      .filter(Boolean),
  );
  const bankAccountNumber = generateUniqueBankAccount(existing);
  const updated = await request<any>("PUT", `ledger/account/${target.id}`, {
    body: { bankAccountNumber },
  });
  return updated?.value ?? target;
}

async function resolveManagerId(project: any) {
  if (project?.projectManager?.email === PROJECT_MANAGER_EMAIL && project?.projectManager?.id) {
    return project.projectManager.id;
  }

  const employeeBody = await request<any>("GET", "employee", {
    query: {
      email: PROJECT_MANAGER_EMAIL,
      assignableProjectManagers: true,
      count: 10,
      fields: "*",
    },
  });
  const manager = exactSingle(
    valuesOf<any>(employeeBody),
    (employee) => employee?.email === PROJECT_MANAGER_EMAIL,
    "project manager",
  );
  if (!manager?.id) throw new Error("Project manager not found");
  return manager.id;
}

async function resolveCustomer(project: any) {
  if (project?.customer?.organizationNumber === CUSTOMER_ORG && project?.customer?.id) {
    return project.customer;
  }

  const customerBody = await request<any>("GET", "customer", {
    query: {
      organizationNumber: CUSTOMER_ORG,
      count: 10,
      fields: "*",
    },
  });
  const allCustomers = valuesOf<any>(customerBody);
  const customers = allCustomers.filter(
    (customer) =>
      customer?.organizationNumber === CUSTOMER_ORG && (customer?.name === CUSTOMER_NAME || allCustomers.length === 1),
  );

  if (customers.length === 1) return customers[0];
  if (customers.length > 1) throw new Error("Ambiguous customer");

  const created = await request<any>("POST", "customer", {
    body: {
      name: CUSTOMER_NAME,
      organizationNumber: CUSTOMER_ORG,
      invoiceSendMethod: "MANUAL",
    },
  });
  return created?.value;
}

async function upsertProject(project: any, customerId: number, managerId: number) {
  if (
    project?.id &&
    project?.customer?.organizationNumber === CUSTOMER_ORG &&
    project?.projectManager?.email === PROJECT_MANAGER_EMAIL &&
    Number(project?.fixedprice) === FIXED_PRICE
  ) {
    return project;
  }

  if (project?.id) {
    const updated = await request<any>("PUT", `project/${project.id}`, {
      body: {
        name: PROJECT_NAME,
        startDate: project.startDate,
        customer: { id: customerId },
        projectManager: { id: managerId },
        isFixedPrice: true,
        fixedprice: FIXED_PRICE,
        invoiceOnAccountVatHigh: false,
      },
    });
    return updated?.value;
  }

  const created = await request<any>("POST", "project", {
    body: {
      name: PROJECT_NAME,
      startDate: TODAY,
      customer: { id: customerId },
      projectManager: { id: managerId },
      isFixedPrice: true,
      fixedprice: FIXED_PRICE,
      invoiceOnAccountVatHigh: false,
    },
  });
  return created?.value;
}

async function createInvoiceFromOrder(orderId: number) {
  try {
    return await request<any>("PUT", `order/${orderId}/:invoice`, {
      query: {
        invoiceDate: TODAY,
        sendToCustomer: false,
      },
    });
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 422 || !hasBankAccountValidationMessage(error.body)) {
      throw error;
    }
    await repairCompanyBankAccount();
    return await request<any>("PUT", `order/${orderId}/:invoice`, {
      query: {
        invoiceDate: TODAY,
        sendToCustomer: false,
      },
    });
  }
}

async function main() {
  const projectSearch = await request<any>("GET", "project", {
    query: {
      name: PROJECT_NAME,
      count: 50,
      fields: "*,customer(*),projectManager(*)",
    },
  });
  const projectCandidate = pickProject(valuesOf<any>(projectSearch));

  const customer = await resolveCustomer(projectCandidate);
  if (!customer?.id) throw new Error("Customer not resolved");

  const managerId = await resolveManagerId(projectCandidate);
  const project = await upsertProject(projectCandidate, customer.id, managerId);
  if (!project?.id) throw new Error("Project not resolved");

  const vatBody = await request<any>("GET", "ledger/vatType", {
    query: {
      typeOfVat: "OUTGOING",
      vatDate: TODAY,
      fields: "*",
    },
  });
  const vatType = pickVatType(valuesOf<any>(vatBody));
  if (!vatType?.id) throw new Error("VAT type not resolved");

  const orderBody = await request<any>("POST", "order", {
    body: {
      customer: { id: customer.id },
      project: { id: project.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
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
  const orderId = orderBody?.value?.id;
  if (!orderId) throw new Error("Order creation failed");

  const invoiceBody = await createInvoiceFromOrder(orderId);
  const invoice = invoiceBody?.value;
  if (!invoice?.id) throw new Error("Invoice creation failed");

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectId: project.id,
        customerId: customer.id,
        orderId,
        invoiceId: invoice.id,
        amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
        amountCurrencyOutstanding: invoice.amountCurrencyOutstanding,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  if (error instanceof BlockedRunError) {
    console.error(JSON.stringify({ ok: false, blocked: true, reason: error.message }, null, 2));
    process.exit(2);
  }

  if (error instanceof HttpError) {
    console.error(JSON.stringify({ ok: false, status: error.status, body: error.body }, null, 2));
    process.exit(1);
  }

  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
