const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const TODAY = "2026-03-20";
const FIXTURE_SUFFIX = "20260320-220947811Z-skip-put";
const CUSTOMER_NAME = `Soleil SARL Proof ${FIXTURE_SUFFIX}`;
const CUSTOMER_ORG_NO = "931336702";
const PROJECT_NAME = `Mise à niveau infrastructure Proof ${FIXTURE_SUFFIX}`;
const TARGET_FIXED_PRICE = 125550;
const PARTIAL_AMOUNT = Number((TARGET_FIXED_PRICE * 0.25).toFixed(2));

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
  calls?: string[],
): Promise<T> {
  if (options.measure && calls) {
    const query = options.query
      ? `?${new URLSearchParams(
          Object.entries(options.query)
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([key, value]) => [key, String(value)]),
        ).toString()}`
      : "";
    calls.push(`${method} /${path}${query}`);
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
  const manager = values.find((employee) => employee.email);
  if (!manager) throw new Error("No assignable manager with email");
  return manager;
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
  for (let prefixNum = 5560000000; prefixNum < 5599999999; prefixNum += 1) {
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

async function ensureBankAccount(): Promise<void> {
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

async function setupFixture() {
  const managers = await request<ApiList<Employee>>("GET", "employee", {
    query: {
      assignableProjectManagers: true,
      count: 50,
      fields: "*",
    },
  });
  const manager = chooseManager(managers.values ?? []);

  const customers = await request<ApiList<Customer>>("GET", "customer", {
    query: {
      organizationNumber: CUSTOMER_ORG_NO,
      count: 10,
      fields: "*",
    },
  });
  let customer =
    (customers.values ?? []).find(
      (candidate) =>
        candidate.organizationNumber === CUSTOMER_ORG_NO && candidate.name === CUSTOMER_NAME,
    ) ?? null;

  if (!customer) {
    customer = (
      await request<ApiValue<Customer>>("POST", "customer", {
        body: {
          name: CUSTOMER_NAME,
          organizationNumber: CUSTOMER_ORG_NO,
          invoiceSendMethod: "MANUAL",
        },
      })
    ).value;
  }

  const projects = await request<ApiList<Project>>("GET", "project", {
    query: {
      name: PROJECT_NAME,
      count: 50,
      fields: "*,customer(*),projectManager(*)",
    },
  });
  let project =
    (projects.values ?? []).find(
      (candidate) =>
        candidate.name === PROJECT_NAME &&
        candidate.customer?.organizationNumber === CUSTOMER_ORG_NO,
    ) ?? null;

  if (!project) {
    project = (
      await request<ApiValue<Project>>("POST", "project", {
        body: {
          name: PROJECT_NAME,
          startDate: TODAY,
          customer: { id: customer.id },
          projectManager: { id: manager.id },
          isFixedPrice: true,
          fixedprice: TARGET_FIXED_PRICE,
          invoiceOnAccountVatHigh: false,
        },
      })
    ).value;
  } else if (
    project.projectManager?.id !== manager.id ||
    Number(project.fixedprice) !== TARGET_FIXED_PRICE
  ) {
    project = (
      await request<ApiValue<Project>>("PUT", `project/${project.id}`, {
        body: {
          name: PROJECT_NAME,
          startDate: project.startDate ?? TODAY,
          customer: { id: customer.id },
          projectManager: { id: manager.id },
          isFixedPrice: true,
          fixedprice: TARGET_FIXED_PRICE,
          invoiceOnAccountVatHigh: false,
        },
      })
    ).value;
  }

  await ensureBankAccount();

  return { managerEmail: manager.email };
}

async function main() {
  const fixture = await setupFixture();
  const measuredCalls: string[] = [];

  const projectSearch = await request<ApiList<Project>>(
    "GET",
    "project",
    {
      query: {
        name: PROJECT_NAME,
        count: 50,
        fields: "*,customer(*),projectManager(*)",
      },
      measure: true,
    },
    measuredCalls,
  );

  const exactProject = (projectSearch.values ?? []).find(
    (candidate) =>
      candidate.name === PROJECT_NAME &&
      candidate.customer?.organizationNumber === CUSTOMER_ORG_NO &&
      candidate.projectManager?.email === fixture.managerEmail &&
      Number(candidate.fixedprice) === TARGET_FIXED_PRICE,
  );
  if (!exactProject?.id || !exactProject.customer?.id) {
    throw new Error(`Project read did not prove skip-PUT branch: ${JSON.stringify(projectSearch.values ?? [])}`);
  }

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
  const vatType = chooseVatType(vatTypes.values ?? []);

  const order = (
    await request<ApiValue<Order>>(
      "POST",
      "order",
      {
        body: {
          customer: { id: exactProject.customer.id },
          project: { id: exactProject.id },
          orderDate: TODAY,
          deliveryDate: TODAY,
          invoiceOnAccountVatHigh: false,
          orderLines: [
            {
              description: "Sandbox proof skip project PUT",
              count: 1,
              unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
              vatType: { id: vatType.id },
            },
          ],
        },
        measure: true,
      },
      measuredCalls,
    )
  ).value;

  const invoice = (
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

  console.log(
    JSON.stringify(
      {
        measuredCalls,
        measuredCallCount: measuredCalls.length,
        vatPercentage: vatType.percentage ?? null,
        invoiceId: invoice.id,
        amountExcludingVatCurrency: invoice.amountExcludingVatCurrency ?? null,
        amountCurrencyOutstanding: invoice.amountCurrencyOutstanding ?? null,
      },
      null,
      2,
    ),
  );
}

await main();
