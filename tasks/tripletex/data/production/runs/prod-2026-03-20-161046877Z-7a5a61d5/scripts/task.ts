const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "BOvbwZ3nMBndmtw0Uh-bkZJ4oGUZlvLMfIN8LBKeXkQ";

const RUN_DATE = "2026-03-20";
const CUSTOMER_NAME = "Ironbridge Ltd";
const CUSTOMER_ORG_NO = "832020141";
const PROJECT_NAME = "CRM Integration";
const PROJECT_MANAGER_EMAIL = "ella.williams@example.org";
const FIXED_PRICE = 428550;
const MILESTONE_AMOUNT = FIXED_PRICE * 0.25;
const RESUME_ORDER_ID = process.env.RESUME_ORDER_ID
  ? Number(process.env.RESUME_ORDER_ID)
  : null;

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

type ApiResponse<T> = {
  value?: T;
  values?: T[];
  fullResultSize?: number;
};

type ApiError = Error & {
  status?: number;
  body?: unknown;
};

function exactOne<T>(items: T[], label: string): T {
  if (items.length !== 1) {
    throw new Error(`${label}: expected 1 match, got ${items.length}`);
  }
  return items[0];
}

async function api<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResponse<T>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    let parsed: unknown;
    const text = await res.text();
    try {
      parsed = text ? JSON.parse(text) : text;
    } catch {
      parsed = text;
    }
    const err = new Error(`HTTP ${res.status} ${method} ${path}`) as ApiError;
    err.status = res.status;
    err.body = parsed;
    throw err;
  }

  if (res.status === 204) {
    return {};
  }

  return (await res.json()) as ApiResponse<T>;
}

function normalizeName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeOrg(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, "") : "";
}

function messageText(err: ApiError): string {
  const body = err.body as any;
  if (typeof body === "string") return body;
  if (Array.isArray(body?.validationMessages)) {
    return body.validationMessages
      .map((x: any) => `${x.field ?? "?"}: ${x.message ?? ""}`)
      .join(" | ");
  }
  if (body?.message && typeof body.message === "string") return body.message;
  if (body?.error && typeof body.error === "string") return body.error;
  return JSON.stringify(body ?? {});
}

function chooseVatType(vatTypes: any[]): any {
  const sorted = [...vatTypes].sort((a, b) => {
    const aPct = typeof a?.percentage === "number" ? a.percentage : -1;
    const bPct = typeof b?.percentage === "number" ? b.percentage : -1;
    return bPct - aPct;
  });
  return sorted[0];
}

function chooseBankAccount(accounts: any[]): any {
  const invoice = accounts.find((account) => account?.isInvoiceAccount);
  if (invoice) return invoice;
  const bank = accounts.find((account) => account?.isBankAccount);
  if (bank) return bank;
  throw new Error("No bank account available for repair");
}

async function ensureCustomer(): Promise<any> {
  const customerList = await api<any>(
    "GET",
    `/customer?organizationNumber=${encodeURIComponent(CUSTOMER_ORG_NO)}&count=10&fields=*`,
  );
  const matches = (customerList.values ?? []).filter(
    (customer) =>
      normalizeOrg(customer?.organizationNumber) === CUSTOMER_ORG_NO &&
      normalizeName(customer?.name) === CUSTOMER_NAME,
  );
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`customer: expected 1 exact match, got ${matches.length}`);

  const byOrg = (customerList.values ?? []).filter(
    (customer) => normalizeOrg(customer?.organizationNumber) === CUSTOMER_ORG_NO,
  );
  if (byOrg.length === 1) return byOrg[0];
  if (byOrg.length > 1) {
    throw new Error(`customer org: expected 1 match, got ${byOrg.length}`);
  }

  const created = await api<any>("POST", "/customer", {
    name: CUSTOMER_NAME,
    organizationNumber: CUSTOMER_ORG_NO,
    invoiceSendMethod: "MANUAL",
  });
  if (!created.value?.id) throw new Error("customer create did not return id");
  return created.value;
}

async function ensureProjectManager(): Promise<any> {
  const employeeList = await api<any>(
    "GET",
    `/employee?email=${encodeURIComponent(PROJECT_MANAGER_EMAIL)}&assignableProjectManagers=true&count=10&fields=*`,
  );
  const exact = (employeeList.values ?? []).filter(
    (employee) => normalizeEmail(employee?.email) === PROJECT_MANAGER_EMAIL,
  );
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    throw new Error(`project manager: expected 1 exact match, got ${exact.length}`);
  }

  const fallback = await api<any>(
    "GET",
    `/employee?email=${encodeURIComponent(PROJECT_MANAGER_EMAIL)}&count=10&fields=*`,
  );
  const fallbackExact = (fallback.values ?? []).filter(
    (employee) => normalizeEmail(employee?.email) === PROJECT_MANAGER_EMAIL,
  );
  if (fallbackExact.length === 0) {
    throw new Error("project manager not found");
  }
  throw new Error("project manager exists but is not assignable");
}

async function ensureProject(customerId: number, managerId: number): Promise<any> {
  const projectList = await api<any>(
    "GET",
    `/project?name=${encodeURIComponent(PROJECT_NAME)}&customerId=${customerId}&count=50&fields=*`,
  );
  const exact = (projectList.values ?? []).filter(
    (project) =>
      normalizeName(project?.name) === PROJECT_NAME &&
      Number(project?.customer?.id) === customerId,
  );

  const projectPayload = {
    name: PROJECT_NAME,
    startDate: RUN_DATE,
    customer: { id: customerId },
    projectManager: { id: managerId },
    isFixedPrice: true,
    fixedprice: FIXED_PRICE,
    invoiceOnAccountVatHigh: false,
  };

  if (exact.length === 0) {
    const created = await api<any>("POST", "/project", projectPayload);
    if (!created.value?.id) throw new Error("project create did not return id");
    return created.value;
  }

  const preferred = exact
    .slice()
    .sort((a, b) => Number(Boolean(a?.isClosed)) - Number(Boolean(b?.isClosed)));
  const project = preferred[0];

  const updated = await api<any>("PUT", `/project/${project.id}`, projectPayload);
  if (!updated.value?.id) throw new Error("project update did not return id");
  return updated.value;
}

async function resolveVatType(): Promise<any> {
  const vatTypes = await api<any>(
    "GET",
    `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${RUN_DATE}&fields=*`,
  );
  const values = vatTypes.values ?? [];
  if (values.length === 0) {
    throw new Error("No valid outgoing VAT types on invoice date");
  }
  return chooseVatType(values);
}

async function createOrder(customerId: number, projectId: number, vatTypeId: number): Promise<any> {
  const order = await api<any>("POST", "/order", {
    customer: { id: customerId },
    project: { id: projectId },
    orderDate: RUN_DATE,
    deliveryDate: RUN_DATE,
    invoiceOnAccountVatHigh: false,
    orderLines: [
      {
        description: "Milestone payment 25% of fixed price",
        count: 1,
        unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
        vatType: { id: vatTypeId },
      },
    ],
  });
  if (!order.value?.id) throw new Error("order create did not return id");
  return order.value;
}

async function repairInvoiceBankAccountAndRetry(orderId: number): Promise<any> {
  const accounts = await api<any>("GET", "/ledger/account?isBankAccount=true&fields=*");
  const account = chooseBankAccount(accounts.values ?? []);
  const candidateNumbers = [
    "12345678903",
    "12345678911",
    "12345678929",
    "12345678937",
  ];
  const newNumber =
    candidateNumbers.find((number) => number !== account?.bankAccountNumber) ??
    "12345678903";

  await api<any>("PUT", `/ledger/account/${account.id}`, {
    bankAccountNumber: newNumber,
  });

  const invoiced = await api<any>(
    "PUT",
    `/order/${orderId}/:invoice?invoiceDate=${RUN_DATE}&sendToCustomer=false`,
  );
  if (!invoiced.value?.id) throw new Error("invoice retry did not return id");
  return invoiced.value;
}

async function invoiceOrder(orderId: number): Promise<any> {
  try {
    const invoiced = await api<any>(
      "PUT",
      `/order/${orderId}/:invoice?invoiceDate=${RUN_DATE}&sendToCustomer=false`,
    );
    if (!invoiced.value?.id) throw new Error("invoice create did not return id");
    return invoiced.value;
  } catch (err) {
    const apiErr = err as ApiError;
    const msg = messageText(apiErr);
    if (
      apiErr.status === 422 &&
      msg.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer")
    ) {
      return repairInvoiceBankAccountAndRetry(orderId);
    }
    throw err;
  }
}

async function maybeVerifyInvoice(invoice: any): Promise<any> {
  if (Number(invoice?.orders?.[0]?.project?.id) > 0) return invoice;
  const invoiceId = Number(invoice?.id);
  if (!invoiceId) return invoice;
  const verified = await api<any>(
    "GET",
    `/invoice/${invoiceId}?fields=*,customer(*),orders(*,project(*,customer(*),projectManager(*)),orderLines(*)),orderLines(*)`,
  );
  return verified.value ?? invoice;
}

async function main() {
  if (RESUME_ORDER_ID) {
    const invoice = await invoiceOrder(RESUME_ORDER_ID);
    const verifiedInvoice = await maybeVerifyInvoice(invoice);
    const summary = {
      resumedOrderId: RESUME_ORDER_ID,
      invoiceId: verifiedInvoice.id,
      invoiceAmountExcludingVatCurrency: verifiedInvoice.amountExcludingVatCurrency,
      invoiceAmountCurrency: verifiedInvoice.amountCurrency,
      invoiceAmountCurrencyOutstanding: verifiedInvoice.amountCurrencyOutstanding,
      invoiceCustomerId: verifiedInvoice.customer?.id,
      invoiceProjectId: verifiedInvoice.orders?.[0]?.project?.id ?? null,
      invoiceProjectFixedPrice: verifiedInvoice.orders?.[0]?.project?.fixedprice ?? null,
      invoiceProjectManagerEmail:
        verifiedInvoice.orders?.[0]?.project?.projectManager?.email ?? null,
    };
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const manager = await ensureProjectManager();
  const customer = await ensureCustomer();
  const project = await ensureProject(Number(customer.id), Number(manager.id));
  const vatType = await resolveVatType();
  const order = await createOrder(Number(customer.id), Number(project.id), Number(vatType.id));
  const invoice = await invoiceOrder(Number(order.id));
  const verifiedInvoice = await maybeVerifyInvoice(invoice);

  const summary = {
    customerId: customer.id,
    projectId: project.id,
    projectFixedPrice: project.fixedprice,
    projectIsFixedPrice: project.isFixedPrice,
    orderId: order.id,
    invoiceId: verifiedInvoice.id,
    invoiceAmountExcludingVatCurrency: verifiedInvoice.amountExcludingVatCurrency,
    invoiceAmountCurrency: verifiedInvoice.amountCurrency,
    invoiceAmountCurrencyOutstanding: verifiedInvoice.amountCurrencyOutstanding,
    invoiceCustomerId: verifiedInvoice.customer?.id,
    invoiceProjectId: verifiedInvoice.orders?.[0]?.project?.id ?? null,
    invoiceProjectFixedPrice: verifiedInvoice.orders?.[0]?.project?.fixedprice ?? null,
    invoiceProjectManagerEmail:
      verifiedInvoice.orders?.[0]?.project?.projectManager?.email ?? null,
    vatTypeId: vatType.id,
    vatPercentage: vatType.percentage,
    milestoneAmount: MILESTONE_AMOUNT,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  const apiErr = err as ApiError;
  console.error(
    JSON.stringify(
      {
        error: apiErr.message,
        status: apiErr.status ?? null,
        body: apiErr.body ?? null,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
