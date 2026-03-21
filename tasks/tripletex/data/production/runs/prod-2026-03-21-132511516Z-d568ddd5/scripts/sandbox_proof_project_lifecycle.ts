const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const START_DATE = "2026-03-21";
const DELIVERY_DATE = "2026-03-25";
const INVOICE_DUE_DATE = "2026-04-04";
const BANK_ACCOUNT_NUMBER = "12345678903";

const PROJECT_BUDGET = 262850;
const SUPPLIER_COST = 89750;
const LUKAS_HOURS = 37;
const TOBIAS_HOURS = 101;

type AnyRecord = Record<string, any>;

const suffix = `${Date.now()}`.slice(-8);
const customerName = `Lifecycle Reflection ${suffix} AS`;
const customerOrg = `999${suffix.slice(-6)}`;
const supplierName = `Lifecycle Supplier ${suffix} AS`;
const supplierOrg = `888${suffix.slice(-6)}`;
const projectName = `Lifecycle Project ${suffix}`;
const lukasEmail = `lukas.${suffix}@example.org`;
const tobiasEmail = `tobias.${suffix}@example.org`;

let callCount = 0;

function endpoint(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(`${BASE_URL.replace(/\/+$/, "")}/${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function authHeader() {
  return `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
}

function unwrap<T>(json: any): T {
  if (json?.values !== undefined) return json.values as T;
  if (json?.value !== undefined) return json.value as T;
  return json as T;
}

async function request<T = any>(
  method: string,
  path: string,
  opts: { query?: Record<string, string | number | boolean | undefined>; body?: any } = {},
): Promise<T> {
  callCount += 1;
  const res = await fetch(endpoint(path, opts.query), {
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
    throw new Error(`${method} ${path} (${res.status}): ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`);
  }
  if (!text) return null as T;
  return unwrap<T>(parsed);
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function splitHours(total: number) {
  const out: { date: string; hours: number }[] = [];
  let remaining = total;
  const date = new Date(`${START_DATE}T00:00:00Z`);
  while (remaining > 0) {
    const hours = Math.min(24, remaining);
    out.push({ date: date.toISOString().slice(0, 10), hours });
    remaining -= hours;
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return out;
}

function chooseInvoiceBankAccount(accounts: AnyRecord[]) {
  return (
    accounts.find((account) => account?.isInvoiceAccount) ??
    accounts.find((account) => Number(account?.number) === 1920) ??
    accounts[0] ??
    null
  );
}

async function main() {
  const [departments, divisions, customer] = await Promise.all([
    request<AnyRecord[]>("GET", "department", {
      query: { isInactive: false, count: 1, fields: "*" },
    }),
    request<AnyRecord[]>("GET", "division", {
      query: { count: 1, fields: "*" },
    }),
    request<AnyRecord>("POST", "customer", {
      body: { name: customerName, organizationNumber: customerOrg },
    }),
  ]);

  let department = departments[0] ?? null;
  if (!department) {
    department = await request<AnyRecord>("POST", "department", {
      body: { name: `Reflection Dept ${suffix}` },
    });
  }
  const division = divisions[0];
  if (!division) throw new Error("No division in sandbox account.");

  const [lukas, managerCandidates] = await Promise.all([
    request<AnyRecord>("POST", "employee", {
      body: {
        firstName: "Lukas",
        lastName: "Hoffmann",
        email: lukasEmail,
        dateOfBirth: "1985-01-15",
        userType: "NO_ACCESS",
        department: { id: department.id },
        employments: [{ startDate: START_DATE, division: { id: division.id } }],
      },
    }),
    request<AnyRecord[]>("GET", "employee", {
      query: { assignableProjectManagers: true, count: 1, fields: "*" },
    }),
  ]);
  const manager = managerCandidates[0];
  if (!manager) throw new Error("No assignable manager in sandbox.");

  const tobias = await request<AnyRecord>("POST", "employee", {
    body: {
      firstName: "Tobias",
      lastName: "Meyer",
      email: tobiasEmail,
      dateOfBirth: "1985-01-16",
      userType: "NO_ACCESS",
      department: { id: department.id },
      employments: [{ startDate: START_DATE, division: { id: division.id } }],
    },
  });

  const project = await request<AnyRecord>("POST", "project", {
    body: {
      name: projectName,
      startDate: START_DATE,
      customer: { id: customer.id },
      projectManager: { id: manager.id },
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

  const [timesheets, supplier] = await Promise.all([
    request<AnyRecord[]>("POST", "timesheet/entry/list", {
      body: [
        ...splitHours(LUKAS_HOURS).map(({ date, hours }) => ({
          employee: { id: lukas.id },
          project: { id: project.id },
          activity: { id: projectActivity.activity.id },
          date,
          hours,
        })),
        ...splitHours(TOBIAS_HOURS).map(({ date, hours }) => ({
          employee: { id: tobias.id },
          project: { id: project.id },
          activity: { id: projectActivity.activity.id },
          date,
          hours,
        })),
      ],
    }),
    request<AnyRecord>("POST", "supplier", {
      body: { name: supplierName, organizationNumber: supplierOrg },
    }),
  ]);

  const [projectCost, vatTypes, bankAccounts] = await Promise.all([
    request<AnyRecord>("POST", "project/orderline", {
      body: {
        project: { id: project.id },
        vendor: { id: supplier.id },
        description: "Leverandørkostnad",
        date: START_DATE,
        count: 1,
        unitCostCurrency: SUPPLIER_COST,
        isChargeable: false,
      },
    }),
    request<AnyRecord[]>("GET", "ledger/vatType", {
      query: { typeOfVat: "OUTGOING", vatDate: START_DATE, fields: "*" },
    }),
    request<AnyRecord[]>("GET", "ledger/account", {
      query: { isBankAccount: true, fields: "*" },
    }),
  ]);

  const vatType =
    vatTypes.find((vat) => Number(vat?.percentage) === 25) ??
    vatTypes.find((vat) => Number(vat?.percentage) > 0) ??
    vatTypes[0];
  if (!vatType) throw new Error("No outgoing VAT type in sandbox.");

  const bankAccount = chooseInvoiceBankAccount(bankAccounts);
  if (!bankAccount) throw new Error("No bank account in sandbox.");
  if (!bankAccount.bankAccountNumber) {
    await request("PUT", `ledger/account/${bankAccount.id}`, {
      body: { bankAccountNumber: BANK_ACCOUNT_NUMBER },
    });
  }

  let directInvoiceResult: AnyRecord | null = null;
  let directInvoiceError: string | null = null;
  const directInvoiceCallsBefore = callCount;
  try {
    directInvoiceResult = await request<AnyRecord>("POST", "invoice", {
      query: { sendToCustomer: false },
      body: {
        invoiceDate: START_DATE,
        invoiceDueDate: INVOICE_DUE_DATE,
        customer: { id: customer.id },
        orders: [
          {
            customer: { id: customer.id },
            project: { id: project.id },
            orderDate: START_DATE,
            deliveryDate: DELIVERY_DATE,
            orderLines: [
              {
                description: projectName,
                count: 1,
                unitPriceExcludingVatCurrency: PROJECT_BUDGET,
                vatType: { id: vatType.id },
              },
            ],
          },
        ],
      },
    });
  } catch (error) {
    directInvoiceError = error instanceof Error ? error.message : String(error);
  }
  const directInvoiceCalls = callCount - directInvoiceCallsBefore;

  let orderInvoiceResult: AnyRecord | null = null;
  if (!directInvoiceResult) {
    const order = await request<AnyRecord>("POST", "order", {
      body: {
        customer: { id: customer.id },
        project: { id: project.id },
        orderDate: START_DATE,
        deliveryDate: DELIVERY_DATE,
        orderLines: [
          {
            description: projectName,
            count: 1,
            unitPriceExcludingVatCurrency: PROJECT_BUDGET,
            vatType: { id: vatType.id },
          },
        ],
      },
    });
    orderInvoiceResult = await request<AnyRecord>("PUT", `order/${order.id}/:invoice`, {
      query: { invoiceDate: START_DATE, sendToCustomer: false },
    });
  }

  console.log(
    JSON.stringify(
      {
        callCount,
        customerId: customer.id,
        supplierId: supplier.id,
        managerId: manager.id,
        projectId: project.id,
        projectActivityId: projectActivity.id,
        timesheetEntryCount: timesheets.length,
        projectCostId: projectCost.id,
        vatType: { id: vatType.id, percentage: vatType.percentage },
        directInvoice: directInvoiceResult
          ? {
              success: true,
              incrementalCalls: directInvoiceCalls,
              invoiceId: directInvoiceResult.id,
              invoiceNumber: directInvoiceResult.invoiceNumber,
              amountExcludingVatCurrency: directInvoiceResult.amountExcludingVatCurrency,
              projectInvoiceDetailsCount: directInvoiceResult.projectInvoiceDetails?.length ?? null,
            }
          : {
              success: false,
              incrementalCalls: directInvoiceCalls,
              error: directInvoiceError,
            },
        orderInvoice: orderInvoiceResult
          ? {
              success: true,
              invoiceId: orderInvoiceResult.id,
              invoiceNumber: orderInvoiceResult.invoiceNumber,
              amountExcludingVatCurrency: orderInvoiceResult.amountExcludingVatCurrency,
            }
          : null,
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
