const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const TODAY = "2026-03-20";
const FIXTURE_SUFFIX = "20260320-222820469Z-proof";
const CUSTOMER_NAME = `Ridgepoint Ltd Proof ${FIXTURE_SUFFIX}`;
const CUSTOMER_ORG = "844419856";
const PROJECT_NAME_SKIP = `CRM Integration Proof ${FIXTURE_SUFFIX} Skip`;
const PROJECT_NAME_UPDATE = `CRM Integration Proof ${FIXTURE_SUFFIX} Update`;
const TARGET_FIXED_PRICE = 498050;
const PARTIAL_AMOUNT = Number((TARGET_FIXED_PRICE * 0.5).toFixed(2));

type QueryValue = string | number | boolean | null | undefined;
type ApiList<T> = { values?: T[] };
type ApiValue<T> = { value: T };

type Customer = {
  id: number;
  name?: string | null;
  organizationNumber?: string | null;
};

type Employee = {
  id: number;
  email?: string | null;
};

type Project = {
  id: number;
  name?: string | null;
  startDate?: string | null;
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
  amountExcludingVatCurrency?: number | null;
  amountCurrencyOutstanding?: number | null;
};

type LedgerAccount = {
  id: number;
  number?: number | string | null;
  bankAccountNumber?: string | null;
  isInvoiceAccount?: boolean | null;
};

function authHeader(): string {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`, "utf8").toString("base64")}`;
}

function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
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
    measure?: boolean;
  } = {},
  measuredCalls?: string[],
): Promise<T> {
  if (options.measure && measuredCalls) {
    const query = options.query
      ? `?${new URLSearchParams(
          Object.entries(options.query)
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([key, value]) => [key, String(value)]),
        ).toString()}`
      : "";
    measuredCalls.push(`${method} /${path}${query}`);
  }

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
  const body = parseBody(text);
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status}: ${JSON.stringify(body)}`);
  }
  return body as T;
}

function chooseManager(values: Employee[]): Employee {
  const exact = values.find((employee) => employee.email === "george.walker@example.org");
  if (exact) return exact;
  const fallback = values.find((employee) => employee.email);
  if (!fallback) throw new Error("No assignable project manager with email");
  return fallback;
}

function chooseVatType(values: VatType[]): VatType {
  const vat25 = values.find((vatType) => Number(vatType.percentage) === 25);
  if (vat25) return vat25;
  if (values.length === 1) return values[0];
  const zeroVat = values.filter((vatType) => Number(vatType.percentage) === 0);
  if (zeroVat.length === values.length && zeroVat.length > 0) return zeroVat[0];
  throw new Error(`No decisive VAT type: ${JSON.stringify(values)}`);
}

function chooseInvoiceBankAccount(values: LedgerAccount[]): LedgerAccount {
  return (
    values.find((account) => account.isInvoiceAccount) ??
    values.find((account) => String(account.number) === "1920") ??
    values[0]
  );
}

function makeValidBankAccountNumber(existingNumbers: Set<string>): string {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  for (let prefixNum = 5570000000; prefixNum < 5599999999; prefixNum += 1) {
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

async function ensureBankAccount() {
  const accounts = await request<ApiList<LedgerAccount>>("GET", "ledger/account", {
    query: { isBankAccount: true, fields: "*" },
  });
  const values = accounts.values ?? [];
  const target = chooseInvoiceBankAccount(values);
  if (target.bankAccountNumber && /^\d{11}$/.test(target.bankAccountNumber)) return;

  const existingNumbers = new Set(
    values
      .map((account) => String(account.bankAccountNumber ?? "").trim())
      .filter((value) => /^\d{11}$/.test(value)),
  );
  await request<ApiValue<LedgerAccount>>("PUT", `ledger/account/${target.id}`, {
    body: { bankAccountNumber: makeValidBankAccountNumber(existingNumbers) },
  });
}

async function ensureCustomer(): Promise<Customer> {
  const customers = await request<ApiList<Customer>>("GET", "customer", {
    query: {
      organizationNumber: CUSTOMER_ORG,
      count: 20,
      fields: "*",
    },
  });
  const existing =
    (customers.values ?? []).find(
      (customer) => customer.organizationNumber === CUSTOMER_ORG && customer.name === CUSTOMER_NAME,
    ) ?? null;
  if (existing) return existing;

  return (
    await request<ApiValue<Customer>>("POST", "customer", {
      body: {
        name: CUSTOMER_NAME,
        organizationNumber: CUSTOMER_ORG,
        invoiceSendMethod: "MANUAL",
      },
    })
  ).value;
}

async function ensureProject(
  name: string,
  customerId: number,
  managerId: number,
  fixedprice: number,
): Promise<Project> {
  const projects = await request<ApiList<Project>>("GET", "project", {
    query: {
      name,
      count: 50,
      fields: "*,customer(*),projectManager(*)",
    },
  });
  const existing =
    (projects.values ?? []).find(
      (project) => project.name === name && project.customer?.organizationNumber === CUSTOMER_ORG,
    ) ?? null;

  if (!existing) {
    return (
      await request<ApiValue<Project>>("POST", "project", {
        body: {
          name,
          startDate: TODAY,
          customer: { id: customerId },
          projectManager: { id: managerId },
          isFixedPrice: true,
          fixedprice,
          invoiceOnAccountVatHigh: false,
        },
      })
    ).value;
  }

  if (existing.projectManager?.id !== managerId || Number(existing.fixedprice) !== fixedprice) {
    return (
      await request<ApiValue<Project>>("PUT", `project/${existing.id}`, {
        body: {
          name,
          startDate: existing.startDate ?? TODAY,
          customer: { id: customerId },
          projectManager: { id: managerId },
          isFixedPrice: true,
          fixedprice,
          invoiceOnAccountVatHigh: false,
        },
      })
    ).value;
  }

  return existing;
}

async function setupFixture() {
  const managers = await request<ApiList<Employee>>("GET", "employee", {
    query: {
      assignableProjectManagers: true,
      count: 50,
      fields: "*",
    },
  });
  const manager = chooseManager(managers.values ?? []);
  const customer = await ensureCustomer();
  const skipProject = await ensureProject(PROJECT_NAME_SKIP, customer.id, manager.id, TARGET_FIXED_PRICE);
  const updateProject = await ensureProject(PROJECT_NAME_UPDATE, customer.id, manager.id, TARGET_FIXED_PRICE - 50);
  await ensureBankAccount();
  return { customer, manager, skipProject, updateProject };
}

async function resolveVatType(measuredCalls: string[]): Promise<VatType> {
  const vatTypes = await request<ApiList<VatType>>(
    "GET",
    "ledger/vatType",
    {
      query: {
        typeOfVat: "OUTGOING",
        vatDate: TODAY,
        fields: "*",
      },
      measure: true,
    },
    measuredCalls,
  );
  return chooseVatType(vatTypes.values ?? []);
}

async function createMilestoneInvoice(
  project: Project,
  customerId: number,
  vatTypeId: number,
  description: string,
  measuredCalls: string[],
): Promise<Invoice> {
  const order = (
    await request<ApiValue<Order>>(
      "POST",
      "order",
      {
        body: {
          customer: { id: customerId },
          project: { id: project.id },
          orderDate: TODAY,
          deliveryDate: TODAY,
          orderLines: [
            {
              description,
              count: 1,
              unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
              vatType: { id: vatTypeId },
            },
          ],
        },
        measure: true,
      },
      measuredCalls,
    )
  ).value;

  return (
    await request<ApiValue<Invoice>>(
      "PUT",
      `order/${order.id}/:invoice`,
      {
        query: {
          invoiceDate: TODAY,
          sendToCustomer: false,
        },
        measure: true,
      },
      measuredCalls,
    )
  ).value;
}

async function proveSkipPutBranch(customerId: number, managerEmail: string) {
  const measuredCalls: string[] = [];
  const projectSearch = await request<ApiList<Project>>(
    "GET",
    "project",
    {
      query: {
        name: PROJECT_NAME_SKIP,
        count: 50,
        fields: "*,customer(*),projectManager(*)",
      },
      measure: true,
    },
    measuredCalls,
  );

  const exactProject =
    (projectSearch.values ?? []).find(
      (project) =>
        project.name === PROJECT_NAME_SKIP &&
        project.customer?.organizationNumber === CUSTOMER_ORG &&
        project.projectManager?.email === managerEmail &&
        Number(project.fixedprice) === TARGET_FIXED_PRICE,
    ) ?? null;
  if (!exactProject?.id || !exactProject.customer?.id) {
    throw new Error(`Skip-PUT proof could not resolve exact project: ${JSON.stringify(projectSearch.values ?? [])}`);
  }

  const vatType = await resolveVatType(measuredCalls);
  const invoice = await createMilestoneInvoice(
    exactProject,
    customerId,
    vatType.id,
    "Sandbox proof skip PUT 50% of 498050",
    measuredCalls,
  );

  return {
    measuredCalls,
    measuredCallCount: measuredCalls.length,
    vatPercentage: vatType.percentage ?? null,
    invoiceId: invoice.id,
    amountExcludingVatCurrency: invoice.amountExcludingVatCurrency ?? null,
    amountCurrencyOutstanding: invoice.amountCurrencyOutstanding ?? null,
  };
}

async function proveUpdateBranch(customerId: number, managerId: number, managerEmail: string) {
  const measuredCalls: string[] = [];
  const projectSearch = await request<ApiList<Project>>(
    "GET",
    "project",
    {
      query: {
        name: PROJECT_NAME_UPDATE,
        count: 50,
        fields: "*,customer(*),projectManager(*)",
      },
      measure: true,
    },
    measuredCalls,
  );

  const exactProject =
    (projectSearch.values ?? []).find(
      (project) =>
        project.name === PROJECT_NAME_UPDATE &&
        project.customer?.organizationNumber === CUSTOMER_ORG &&
        project.projectManager?.email === managerEmail &&
        Number(project.fixedprice) === TARGET_FIXED_PRICE - 50,
    ) ?? null;
  if (!exactProject?.id || !exactProject.customer?.id) {
    throw new Error(`Update proof could not resolve exact project: ${JSON.stringify(projectSearch.values ?? [])}`);
  }

  const updatedProject = (
    await request<ApiValue<Project>>(
      "PUT",
      `project/${exactProject.id}`,
      {
        body: {
          name: PROJECT_NAME_UPDATE,
          startDate: exactProject.startDate ?? TODAY,
          customer: { id: customerId },
          projectManager: { id: managerId },
          isFixedPrice: true,
          fixedprice: TARGET_FIXED_PRICE,
          invoiceOnAccountVatHigh: false,
        },
        measure: true,
      },
      measuredCalls,
    )
  ).value;

  if (Number(updatedProject.fixedprice) !== TARGET_FIXED_PRICE) {
    throw new Error(`Project update did not set fixedprice=${TARGET_FIXED_PRICE}`);
  }

  const vatType = await resolveVatType(measuredCalls);
  const invoice = await createMilestoneInvoice(
    updatedProject,
    customerId,
    vatType.id,
    "Sandbox proof update branch 50% of 498050",
    measuredCalls,
  );

  return {
    measuredCalls,
    measuredCallCount: measuredCalls.length,
    vatPercentage: vatType.percentage ?? null,
    invoiceId: invoice.id,
    amountExcludingVatCurrency: invoice.amountExcludingVatCurrency ?? null,
    amountCurrencyOutstanding: invoice.amountCurrencyOutstanding ?? null,
  };
}

async function main() {
  const fixture = await setupFixture();
  const skipPut = await proveSkipPutBranch(fixture.customer.id, fixture.manager.email ?? "");
  const updateBranch = await proveUpdateBranch(
    fixture.customer.id,
    fixture.manager.id,
    fixture.manager.email ?? "",
  );

  console.log(
    JSON.stringify(
      {
        managerEmailUsed: fixture.manager.email ?? null,
        customerId: fixture.customer.id,
        skipPut,
        updateBranch,
      },
      null,
      2,
    ),
  );
}

await main();
