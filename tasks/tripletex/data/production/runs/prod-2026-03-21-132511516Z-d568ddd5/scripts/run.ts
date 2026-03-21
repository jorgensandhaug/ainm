const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "Y2-TDhAD9SOTqA20rygZU9D5pP9Mef0O44az7Y_Ryt0";

const PROJECT_NAME = "Cloud-Migration Brückentor";
const CUSTOMER_NAME = "Brückentor GmbH";
const CUSTOMER_ORG = "882854000";
const SUPPLIER_NAME = "Sonnental GmbH";
const SUPPLIER_ORG = "930613118";

const START_DATE = "2026-03-21";
const INVOICE_DATE = "2026-03-21";
const DELIVERY_DATE = "2026-03-25";
const PROJECT_BUDGET = 262850;
const SUPPLIER_COST = 89750;
const BANK_ACCOUNT_NUMBER = "12345678903";

const LUKAS = {
  firstName: "Lukas",
  lastName: "Hoffmann",
  email: "lukas.hoffmann@example.org",
  dateOfBirth: "1985-01-15",
  hours: 37,
};

const TOBIAS = {
  firstName: "Tobias",
  lastName: "Meyer",
  email: "tobias.meyer@example.org",
  dateOfBirth: "1985-01-16",
  hours: 101,
};

type AnyRecord = Record<string, any>;

function urlFor(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const base = BASE_URL.replace(/\/+$/, "");
  const url = new URL(`${base}/${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

function unwrap<T>(json: any): T {
  if (json?.values !== undefined) return json.values as T;
  if (json?.value !== undefined) return json.value as T;
  return json as T;
}

function authHeader() {
  return `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
}

async function request<T = any>(
  method: string,
  path: string,
  opts: { query?: Record<string, string | number | boolean | undefined>; body?: any } = {},
): Promise<T> {
  const res = await fetch(urlFor(path, opts.query), {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  const parsed = text ? safeJson(text) : null;

  if (!res.ok) {
    const detail = parsed ?? text;
    const message = typeof detail === "string" ? detail : JSON.stringify(detail);
    throw new Error(`${method} ${path} failed (${res.status}): ${message}`);
  }

  if (!text) {
    return null as T;
  }

  return unwrap<T>(parsed);
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function exactEmail(items: AnyRecord[], email: string) {
  const needle = email.toLowerCase();
  return items.find((item) => String(item?.email ?? "").toLowerCase() === needle) ?? null;
}

function splitHours(total: number, startDate: string) {
  const entries: { date: string; hours: number }[] = [];
  let remaining = total;
  const date = new Date(`${startDate}T00:00:00Z`);
  while (remaining > 0) {
    const hours = Math.min(24, remaining);
    entries.push({ date: date.toISOString().slice(0, 10), hours });
    remaining -= hours;
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return entries;
}

function chooseVatType(vats: AnyRecord[]) {
  const exact25 = vats.find((vat) => Number(vat?.percentage) === 25);
  if (exact25) return exact25;
  throw new Error(`No outgoing 25% VAT row available: ${JSON.stringify(vats)}`);
}

function chooseInvoiceBankAccount(accounts: AnyRecord[]) {
  return (
    accounts.find((account) => account?.isInvoiceAccount) ??
    accounts.find((account) => Number(account?.number) === 1920) ??
    accounts[0] ??
    null
  );
}

async function ensureDepartmentAndDivision() {
  const [departments, divisions] = await Promise.all([
    request<AnyRecord[]>("GET", "department", {
      query: { isInactive: false, count: 1, fields: "*" },
    }),
    request<AnyRecord[]>("GET", "division", {
      query: { count: 1, fields: "*" },
    }),
  ]);

  let department = departments[0] ?? null;
  if (!department) {
    department = await request<AnyRecord>("POST", "department", {
      body: { name: "Avdeling" },
    });
  }

  const division = divisions[0] ?? null;
  if (!division) {
    throw new Error("No division found for employee creation.");
  }

  return { department, division };
}

async function createEmployee(employee: typeof LUKAS | typeof TOBIAS, departmentId: number, divisionId: number) {
  return request<AnyRecord>("POST", "employee", {
    body: {
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      dateOfBirth: employee.dateOfBirth,
      userType: "NO_ACCESS",
      department: { id: departmentId },
      employments: [{ startDate: START_DATE, division: { id: divisionId } }],
    },
  });
}

async function main() {
  const customer = await request<AnyRecord>("POST", "customer", {
    body: {
      name: CUSTOMER_NAME,
      organizationNumber: CUSTOMER_ORG,
    },
  });

  const [assignableLukasList, plainLukasList, plainTobiasList, supplier] = await Promise.all([
    request<AnyRecord[]>("GET", "employee", {
      query: { email: LUKAS.email, assignableProjectManagers: true, count: 10, fields: "*" },
    }),
    request<AnyRecord[]>("GET", "employee", {
      query: { email: LUKAS.email, count: 10, fields: "*" },
    }),
    request<AnyRecord[]>("GET", "employee", {
      query: { email: TOBIAS.email, count: 10, fields: "*" },
    }),
    request<AnyRecord>("POST", "supplier", {
      body: {
        name: SUPPLIER_NAME,
        organizationNumber: SUPPLIER_ORG,
      },
    }),
  ]);

  let assignableLukas = exactEmail(assignableLukasList, LUKAS.email);
  let lukasEmployee = exactEmail(plainLukasList, LUKAS.email);
  let tobiasEmployee = exactEmail(plainTobiasList, TOBIAS.email);
  let fallbackManager: AnyRecord | null = null;

  if (!lukasEmployee || !tobiasEmployee) {
    const { department, division } = await ensureDepartmentAndDivision();
    const createJobs: Promise<AnyRecord>[] = [];
    const labels: string[] = [];

    if (!lukasEmployee) {
      createJobs.push(createEmployee(LUKAS, department.id, division.id));
      labels.push("lukas");
    }
    if (!tobiasEmployee) {
      createJobs.push(createEmployee(TOBIAS, department.id, division.id));
      labels.push("tobias");
    }

    const created = await Promise.all(createJobs);
    created.forEach((employee, index) => {
      if (labels[index] === "lukas") lukasEmployee = employee;
      if (labels[index] === "tobias") tobiasEmployee = employee;
    });
  }

  if (!assignableLukas) {
    const managers = await request<AnyRecord[]>("GET", "employee", {
      query: { assignableProjectManagers: true, count: 1, fields: "*" },
    });
    fallbackManager = managers[0] ?? null;
  }

  const projectManager = assignableLukas ?? fallbackManager;
  if (!projectManager) {
    throw new Error("No assignable project manager available.");
  }
  if (!lukasEmployee || !tobiasEmployee) {
    throw new Error("Missing employee after resolution.");
  }

  const project = await request<AnyRecord>("POST", "project", {
    body: {
      name: PROJECT_NAME,
      startDate: START_DATE,
      customer: { id: customer.id },
      projectManager: { id: projectManager.id },
    },
  });

  const projectActivity = await request<AnyRecord>("POST", "project/projectActivity", {
    body: {
      project: { id: project.id },
      startDate: START_DATE,
      budgetFeeCurrency: PROJECT_BUDGET,
      activity: {
        name: "Prosjektarbeid",
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: false,
      },
    },
  });

  const timesheetEntries = [
    ...splitHours(LUKAS.hours, START_DATE).map(({ date, hours }) => ({
      employee: { id: lukasEmployee!.id },
      project: { id: project.id },
      activity: { id: projectActivity.activity.id },
      date,
      hours,
    })),
    ...splitHours(TOBIAS.hours, START_DATE).map(({ date, hours }) => ({
      employee: { id: tobiasEmployee!.id },
      project: { id: project.id },
      activity: { id: projectActivity.activity.id },
      date,
      hours,
    })),
  ];

  const [createdTimesheets] = await Promise.all([
    request<AnyRecord[]>("POST", "timesheet/entry/list", { body: timesheetEntries }),
  ]);

  const [projectCost, vatTypes, bankAccounts] = await Promise.all([
    request<AnyRecord>("POST", "project/orderline", {
      body: {
        project: { id: project.id },
        vendor: { id: supplier.id },
        description: "Lieferantenkosten",
        date: INVOICE_DATE,
        count: 1,
        unitCostCurrency: SUPPLIER_COST,
        isChargeable: false,
      },
    }),
    request<AnyRecord[]>("GET", "ledger/vatType", {
      query: { typeOfVat: "OUTGOING", vatDate: INVOICE_DATE, fields: "*" },
    }),
    request<AnyRecord[]>("GET", "ledger/account", {
      query: { isBankAccount: true, fields: "*" },
    }),
  ]);

  const vatType = chooseVatType(vatTypes);
  const invoiceBankAccount = chooseInvoiceBankAccount(bankAccounts);

  if (!invoiceBankAccount) {
    throw new Error("No bank account found.");
  }

  if (!invoiceBankAccount.bankAccountNumber) {
    await request<AnyRecord>("PUT", `ledger/account/${invoiceBankAccount.id}`, {
      body: { bankAccountNumber: BANK_ACCOUNT_NUMBER },
    });
  }

  const order = await request<AnyRecord>("POST", "order", {
    body: {
      customer: { id: customer.id },
      project: { id: project.id },
      orderDate: INVOICE_DATE,
      deliveryDate: DELIVERY_DATE,
      orderLines: [
        {
          description: PROJECT_NAME,
          count: 1,
          unitPriceExcludingVatCurrency: PROJECT_BUDGET,
          vatType: { id: vatType.id },
        },
      ],
    },
  });

  const invoice = await request<AnyRecord>("PUT", `order/${order.id}/:invoice`, {
    query: { invoiceDate: INVOICE_DATE, sendToCustomer: false },
  });

  console.log(
    JSON.stringify(
      {
        customerId: customer.id,
        supplierId: supplier.id,
        projectId: project.id,
        projectManagerId: projectManager.id,
        lukasEmployeeId: lukasEmployee.id,
        tobiasEmployeeId: tobiasEmployee.id,
        projectActivityId: projectActivity.id,
        timesheetEntryIds: createdTimesheets.map((entry) => entry.id),
        supplierCostOrderLineId: projectCost.id,
        orderId: order.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        budgetFeeCurrency: projectActivity.budgetFeeCurrency,
        invoiceAmountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
