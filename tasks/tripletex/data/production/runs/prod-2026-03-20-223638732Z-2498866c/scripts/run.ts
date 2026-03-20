const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "DSHKUkkE-zvOvrPzDvXKOEmvSJ0S0YK60moEn_b_Feo";

const TODAY = "2026-03-20";
const CUSTOMER_NAME = "Windkraft GmbH";
const CUSTOMER_ORG = "886395582";
const PROJECT_NAME = "Datensicherheit";
const MANAGER_EMAIL = "maximilian.wagner@example.org";
const FIXED_PRICE = 473250;
const MILESTONE_AMOUNT = 118312.5;
const LINE_DESCRIPTION = "Meilensteinzahlung 25% des Festpreises";
const BANK_ACCOUNT_NUMBER = "12345678903";

type WrappedList<T> = { values?: T[]; fullResultSize?: number };
type WrappedValue<T> = { value?: T };

type Customer = {
  id: number;
  name?: string;
  organizationNumber?: string;
};

type Employee = {
  id: number;
  email?: string;
};

type Project = {
  id: number;
  name?: string;
  startDate?: string;
  fixedprice?: number;
  customer?: Customer | null;
  projectManager?: Employee | null;
};

type VatType = {
  id: number;
  percentage?: number;
};

type Order = {
  id: number;
};

type Account = {
  id: number;
  number?: string;
  name?: string;
  bankAccountNumber?: string | null;
  isInvoiceAccount?: boolean;
};

type ApiResult<T> = {
  status: number;
  data: T | null;
  raw: string;
};

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(path, `${BASE_URL}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.append(key, String(value));
    }
  }
  return url.toString();
}

async function request<T>(
  method: string,
  path: string,
  opts: { query?: Record<string, string | number | boolean | undefined>; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const res = await fetch(buildUrl(path, opts.query), {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const raw = await res.text();
  let data: T | null = null;
  if (raw) {
    try {
      data = JSON.parse(raw) as T;
    } catch {
      data = null;
    }
  }

  if (res.status === 403) {
    if (
      raw.includes("Invalid or expired token") ||
      raw.includes("Invalid or expired proxy token")
    ) {
      throw new Error(`Blocked credentials: ${raw}`);
    }
  }

  return { status: res.status, data, raw };
}

function expectOk<T>(result: ApiResult<T>, expected: number[], context: string): T {
  if (!expected.includes(result.status) || !result.data) {
    throw new Error(`${context} failed (${result.status}): ${result.raw}`);
  }
  return result.data;
}

function exactProjectMatch(project: Project): boolean {
  return (
    project.name === PROJECT_NAME &&
    project.customer?.organizationNumber === CUSTOMER_ORG
  );
}

function exactManagerMatch(project: Project): boolean {
  return project.projectManager?.email === MANAGER_EMAIL;
}

function fixedPriceMatches(project: Project): boolean {
  return Number(project.fixedprice) === FIXED_PRICE;
}

function chooseProject(projects: Project[]): Project | undefined {
  const exact = projects.filter(exactProjectMatch);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    const withManager = exact.filter(exactManagerMatch);
    if (withManager.length === 1) return withManager[0];
    const withPrice = exact.filter((p) => exactManagerMatch(p) && fixedPriceMatches(p));
    if (withPrice.length === 1) return withPrice[0];
    throw new Error(`Ambiguous project match count=${exact.length}`);
  }
  return undefined;
}

function chooseCustomer(customers: Customer[]): Customer | undefined {
  const exact = customers.filter((c) => c.organizationNumber === CUSTOMER_ORG);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    const named = exact.filter((c) => c.name === CUSTOMER_NAME);
    if (named.length === 1) return named[0];
    throw new Error(`Ambiguous customer match count=${exact.length}`);
  }
  return undefined;
}

function chooseEmployee(employees: Employee[]): Employee {
  const exact = employees.filter((e) => e.email === MANAGER_EMAIL);
  if (exact.length !== 1) {
    throw new Error(`Expected exactly one manager, got ${exact.length}`);
  }
  return exact[0];
}

function chooseVatType(vats: VatType[]): VatType {
  const vat25 = vats.find((v) => Number(v.percentage) === 25);
  if (vat25) return vat25;
  if (vats.length === 1 && Number(vats[0].percentage) === 0) return vats[0];
  throw new Error(`No safe VAT type found: ${JSON.stringify(vats)}`);
}

function chooseInvoiceBankAccount(accounts: Account[]): Account {
  const invoice = accounts.find((a) => a.isInvoiceAccount);
  if (invoice) return invoice;
  if (accounts.length === 1) return accounts[0];
  const acct1920 = accounts.find((a) => a.number === "1920");
  if (acct1920) return acct1920;
  throw new Error(`No decisive invoice bank account: ${JSON.stringify(accounts)}`);
}

function hasValidBankAccountNumber(account: Account): boolean {
  return typeof account.bankAccountNumber === "string" && /^\d{11}$/.test(account.bankAccountNumber);
}

async function main() {
  const projectSearch = expectOk(
    await request<WrappedList<Project>>("GET", "project", {
      query: {
        name: PROJECT_NAME,
        count: 50,
        fields: "*,customer(*),projectManager(*)",
      },
    }),
    [200],
    "GET /project",
  );

  const project = chooseProject(projectSearch.values ?? []);

  let customerId: number;
  let projectId: number;
  let projectStartDate: string;
  let managerId: number | undefined;
  let needProjectWrite = true;

  if (project) {
    customerId = project.customer!.id;
    projectId = project.id;
    projectStartDate = project.startDate || TODAY;
    if (exactManagerMatch(project)) managerId = project.projectManager!.id;
    if (exactManagerMatch(project) && fixedPriceMatches(project)) {
      needProjectWrite = false;
    }
  } else {
    const customerSearch = expectOk(
      await request<WrappedList<Customer>>("GET", "customer", {
        query: {
          organizationNumber: CUSTOMER_ORG,
          count: 10,
          fields: "*",
        },
      }),
      [200],
      "GET /customer",
    );

    const customer = chooseCustomer(customerSearch.values ?? []);
    if (customer) {
      customerId = customer.id;
    } else {
      const createdCustomer = expectOk(
        await request<WrappedValue<Customer>>("POST", "customer", {
          body: {
            name: CUSTOMER_NAME,
            organizationNumber: CUSTOMER_ORG,
            invoiceSendMethod: "MANUAL",
          },
        }),
        [201, 200],
        "POST /customer",
      );
      if (!createdCustomer.value?.id) throw new Error("Customer create missing id");
      customerId = createdCustomer.value.id;
    }
    projectStartDate = TODAY;
  }

  if (!managerId) {
    const employeeSearch = expectOk(
      await request<WrappedList<Employee>>("GET", "employee", {
        query: {
          email: MANAGER_EMAIL,
          assignableProjectManagers: true,
          count: 10,
          fields: "*",
        },
      }),
      [200],
      "GET /employee",
    );
    managerId = chooseEmployee(employeeSearch.values ?? []).id;
  }

  if (project && needProjectWrite) {
    const updatedProject = expectOk(
      await request<WrappedValue<Project>>("PUT", `project/${project.id}`, {
        body: {
          name: PROJECT_NAME,
          startDate: projectStartDate,
          customer: { id: customerId },
          projectManager: { id: managerId },
          isFixedPrice: true,
          fixedprice: FIXED_PRICE,
          invoiceOnAccountVatHigh: false,
        },
      }),
      [200],
      "PUT /project/{id}",
    );
    if (!updatedProject.value?.id) throw new Error("Project update missing id");
    projectId = updatedProject.value.id;
    customerId = updatedProject.value.customer?.id ?? customerId;
  } else if (!project) {
    const createdProject = expectOk(
      await request<WrappedValue<Project>>("POST", "project", {
        body: {
          name: PROJECT_NAME,
          startDate: projectStartDate,
          customer: { id: customerId },
          projectManager: { id: managerId },
          isFixedPrice: true,
          fixedprice: FIXED_PRICE,
          invoiceOnAccountVatHigh: false,
        },
      }),
      [201, 200],
      "POST /project",
    );
    if (!createdProject.value?.id) throw new Error("Project create missing id");
    projectId = createdProject.value.id;
    customerId = createdProject.value.customer?.id ?? customerId;
  }

  const vatSearch = expectOk(
    await request<WrappedList<VatType>>("GET", "ledger/vatType", {
      query: {
        typeOfVat: "OUTGOING",
        vatDate: TODAY,
        fields: "*",
      },
    }),
    [200],
    "GET /ledger/vatType",
  );
  const vatType = chooseVatType(vatSearch.values ?? []);

  const createdOrder = expectOk(
    await request<WrappedValue<Order>>("POST", "order", {
      body: {
        customer: { id: customerId },
        project: { id: projectId },
        orderDate: TODAY,
        deliveryDate: TODAY,
        invoiceOnAccountVatHigh: false,
        orderLines: [
          {
            description: LINE_DESCRIPTION,
            count: 1,
            unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
            vatType: { id: vatType.id },
          },
        ],
      },
    }),
    [201, 200],
    "POST /order",
  );
  const orderId = createdOrder.value?.id;
  if (!orderId) throw new Error("Order create missing id");

  let invoiceResult = await request<WrappedValue<Record<string, unknown>>>(
    "PUT",
    `order/${orderId}/:invoice`,
    {
      query: {
        invoiceDate: TODAY,
        sendToCustomer: false,
      },
    },
  );

  if (
    invoiceResult.status === 422 &&
    invoiceResult.raw.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.")
  ) {
    const accountSearch = expectOk(
      await request<WrappedList<Account>>("GET", "ledger/account", {
        query: {
          isBankAccount: true,
          fields: "*",
        },
      }),
      [200],
      "GET /ledger/account",
    );
    const account = chooseInvoiceBankAccount(accountSearch.values ?? []);
    if (!hasValidBankAccountNumber(account)) {
      expectOk(
        await request<WrappedValue<Account>>("PUT", `ledger/account/${account.id}`, {
          body: {
            bankAccountNumber: BANK_ACCOUNT_NUMBER,
          },
        }),
        [200],
        "PUT /ledger/account/{id}",
      );
    }
    invoiceResult = await request<WrappedValue<Record<string, unknown>>>(
      "PUT",
      `order/${orderId}/:invoice`,
      {
        query: {
          invoiceDate: TODAY,
          sendToCustomer: false,
        },
      },
    );
  }

  const invoice = expectOk(invoiceResult, [200, 201], "PUT /order/{id}/:invoice");
  console.log(JSON.stringify(invoice, null, 2));
}

await main();
