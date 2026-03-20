const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const RUN_DATE = "2026-03-20";
const DUE_DATE = "2026-04-03";

const SANDBOX_CUSTOMER = {
  organizationNumber: "909722502",
  name: "Oakwood Ltd Sandbox Analog 20260320",
  email: "oakwood-sbx-20260320-2@example.com",
};

const ANALOG_LINES = [
  { description: "Analysis Report [Oakwood SBX 20260320]", productNumber: "29796", promptRef: "9796", amount: 27700 },
  { description: "Maintenance [Oakwood SBX 20260320]", productNumber: "22145", promptRef: "2145", amount: 12700 },
  { description: "System Development [Oakwood SBX 20260320]", productNumber: "25995", promptRef: "5995", amount: 7050 },
] as const;

type TripletexListResponse<T> = { values?: T[] };
type TripletexWrapper<T> = { value?: T };

type Customer = { id: number; name?: string; organizationNumber?: string };
type Product = { id: number; name?: string; number?: string; vatType?: { id?: number | null } | null };
type VatType = {
  id: number;
  number?: string;
  name?: string;
  displayName?: string;
  percentage?: number;
  deductionPercentage?: number;
  parentType?: { id?: number | null } | null;
};
type Account = {
  id: number;
  version?: number;
  number?: number;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
  bankAccountNumber?: string | null;
};
type Invoice = {
  id: number;
  invoiceNumber?: number;
  amountExcludingVatCurrency?: number;
  amountCurrency?: number;
};

class ApiError extends Error {
  status: number;
  bodyText: string;
  bodyJson: any;

  constructor(message: string, status: number, bodyText: string, bodyJson: any) {
    super(message);
    this.status = status;
    this.bodyText = bodyText;
    this.bodyJson = bodyJson;
  }
}

let totalCallCount = 0;
let proofCallCount = 0;
let proofMode = false;

function authHeader(): string {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

function query(params: Record<string, string | number | boolean | undefined>): URLSearchParams {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) result.append(key, String(value));
  }
  return result;
}

async function api<T>(method: string, path: string, options?: { query?: URLSearchParams; body?: unknown }): Promise<T> {
  totalCallCount += 1;
  if (proofMode) proofCallCount += 1;

  const url = new URL(`${BASE_URL}${path}`);
  if (options?.query) url.search = options.query.toString();

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(options?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  const bodyText = await response.text();
  const bodyJson = bodyText ? safeJson(bodyText) : undefined;

  if (!response.ok) {
    throw new ApiError(`${method} ${url.pathname}${url.search} failed with ${response.status}`, response.status, bodyText, bodyJson);
  }

  return bodyJson as T;
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isMissingBankAccountError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 422 && error.bodyText.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.");
}

async function getOutgoingVatTypes(): Promise<VatType[]> {
  const response = await api<TripletexListResponse<VatType>>("GET", "/ledger/vatType", {
    query: query({ typeOfVat: "OUTGOING", vatDate: RUN_DATE, fields: "*" }),
  });
  return response.values ?? [];
}

function pickZeroVatType(vatTypes: VatType[]): VatType {
  const zeroTypes = vatTypes.filter((vatType) => Number(vatType.percentage) === 0);
  if (zeroTypes.length === 0) throw new Error("Sandbox has no outgoing 0% VAT type");

  return [...zeroTypes].sort((a, b) => {
    const aScore = [
      a.parentType?.id === 0 || a.parentType == null ? 0 : 1,
      a.deductionPercentage == null || a.deductionPercentage === 100 ? 0 : 1,
      Number.parseInt(String(a.number ?? "999999"), 10),
    ];
    const bScore = [
      b.parentType?.id === 0 || b.parentType == null ? 0 : 1,
      b.deductionPercentage == null || b.deductionPercentage === 100 ? 0 : 1,
      Number.parseInt(String(b.number ?? "999999"), 10),
    ];
    return aScore[0] - bScore[0] || aScore[1] - bScore[1] || aScore[2] - bScore[2];
  })[0];
}

async function ensureCustomer(): Promise<Customer> {
  const existing = await api<TripletexListResponse<Customer>>("GET", "/customer", {
    query: query({ organizationNumber: SANDBOX_CUSTOMER.organizationNumber, fields: "*" }),
  });

  const match = (existing.values ?? []).find(
    (customer) => String(customer.organizationNumber ?? "") === SANDBOX_CUSTOMER.organizationNumber,
  );
  if (match) return match;

  const created = await api<TripletexWrapper<Customer>>("POST", "/customer", {
    body: {
      name: SANDBOX_CUSTOMER.name,
      email: SANDBOX_CUSTOMER.email,
      organizationNumber: SANDBOX_CUSTOMER.organizationNumber,
    },
  });

  if (!created.value) throw new Error("Customer create returned no value");
  return created.value;
}

async function getProductCatalog(): Promise<Product[]> {
  const response = await api<TripletexListResponse<Product>>("GET", "/product", {
    query: query({ count: 1000, fields: "*" }),
  });
  return response.values ?? [];
}

async function ensureProducts(zeroVatType: VatType): Promise<void> {
  const catalog = await getProductCatalog();

  for (const line of ANALOG_LINES) {
    const match = catalog.find(
      (product) => String(product.name ?? "") === line.description && String(product.number ?? "") === line.productNumber,
    );
    if (match) continue;

    await api<TripletexWrapper<Product>>("POST", "/product", {
      body: {
        name: line.description,
        number: line.productNumber,
        priceExcludingVatCurrency: line.amount,
        vatType: { id: zeroVatType.id },
      },
    });
  }
}

async function repairCompanyBankAccount(): Promise<void> {
  const response = await api<TripletexListResponse<Account>>("GET", "/ledger/account", {
    query: query({ isBankAccount: true, fields: "*" }),
  });
  const accounts = response.values ?? [];
  const preferred =
    accounts.find((account) => account.isInvoiceAccount) ??
    accounts.find((account) => account.number === 1920) ??
    accounts.find((account) => account.isBankAccount);

  if (!preferred) throw new Error("No bank account available for repair");
  if (preferred.bankAccountNumber) return;

  await api<TripletexWrapper<Account>>("PUT", `/ledger/account/${preferred.id}`, {
    body: {
      id: preferred.id,
      version: preferred.version,
      bankAccountNumber: "12345678903",
    },
  });
}

async function proofRun(): Promise<{ invoice: Invoice; resolvedProductNumbers: string[] }> {
  proofMode = true;
  proofCallCount = 0;

  const customerResponse = await api<TripletexListResponse<Customer>>("GET", "/customer", {
    query: query({ organizationNumber: SANDBOX_CUSTOMER.organizationNumber, fields: "*" }),
  });
  const customer = (customerResponse.values ?? []).find(
    (value) => String(value.organizationNumber ?? "") === SANDBOX_CUSTOMER.organizationNumber,
  );
  if (!customer) throw new Error("Proof customer missing");

  const catalog = await getProductCatalog();
  const resolvedProducts = ANALOG_LINES.map((line) => {
    const matches = catalog.filter((product) => String(product.name ?? "") === line.description);
    if (matches.length !== 1) {
      throw new Error(`Expected exactly one exact-name match for ${line.description}, got ${matches.length}`);
    }
    return matches[0];
  });

  const vatTypes = await getOutgoingVatTypes();
  const zeroVatType = pickZeroVatType(vatTypes);

  const payload = {
    invoiceDate: RUN_DATE,
    invoiceDueDate: DUE_DATE,
    customer: { id: customer.id },
    orders: [
      {
        customer: { id: customer.id },
        orderDate: RUN_DATE,
        deliveryDate: RUN_DATE,
        orderLines: ANALOG_LINES.map((line, index) => ({
          product: { id: resolvedProducts[index].id },
          description: line.description,
          count: 1,
          unitPriceExcludingVatCurrency: line.amount,
          vatType: { id: zeroVatType.id },
        })),
      },
    ],
  };

  let invoice: Invoice;
  try {
    const response = await api<TripletexWrapper<Invoice>>("POST", "/invoice", {
      query: query({ sendToCustomer: false }),
      body: payload,
    });
    if (!response.value) throw new Error("Invoice create returned no value");
    invoice = response.value;
  } catch (error) {
    if (!isMissingBankAccountError(error)) throw error;
    await repairCompanyBankAccount();
    const retry = await api<TripletexWrapper<Invoice>>("POST", "/invoice", {
      query: query({ sendToCustomer: false }),
      body: payload,
    });
    if (!retry.value) throw new Error("Invoice retry returned no value");
    invoice = retry.value;
  } finally {
    proofMode = false;
  }

  return {
    invoice,
    resolvedProductNumbers: resolvedProducts.map((product) => String(product.number ?? "")),
  };
}

async function main() {
  const vatTypes = await getOutgoingVatTypes();
  const zeroVatType = pickZeroVatType(vatTypes);
  const customer = await ensureCustomer();
  await ensureProducts(zeroVatType);
  const proof = await proofRun();

  console.log(
    JSON.stringify(
      {
        ok: true,
        sandboxConstraint: {
          outgoingVatPercentages: [...new Set(vatTypes.map((vatType) => Number(vatType.percentage)))],
        },
        setupCustomerId: customer.id,
        analogPromptRefs: ANALOG_LINES.map((line) => line.promptRef),
        proofResolvedProductNumbers: proof.resolvedProductNumbers,
        proofCallCount,
        totalCallCount,
        invoiceId: proof.invoice.id,
        invoiceNumber: proof.invoice.invoiceNumber,
        amountExcludingVatCurrency: proof.invoice.amountExcludingVatCurrency,
        amountCurrency: proof.invoice.amountCurrency,
      },
      null,
      2,
    ),
  );
}

await main();
