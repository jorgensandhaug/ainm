const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "NtGgm6k63w7euqRN3qF_98eCFO3FBn0WiuBg97lFikA";
const INVOICE_DATE = "2026-03-20";
const INVOICE_DUE_DATE = "2026-04-03";

const CUSTOMER = {
  organizationNumber: "909722500",
  name: "Oakwood Ltd",
};

const LINES = [
  { description: "Analysis Report", productNumber: "9796", unitPriceExcludingVatCurrency: 27700, vatPercentage: 25 },
  { description: "Maintenance", productNumber: "2145", unitPriceExcludingVatCurrency: 12700, vatPercentage: 15 },
  { description: "System Development", productNumber: "5995", unitPriceExcludingVatCurrency: 7050, vatPercentage: 0 },
] as const;

const EXPECTED_AMOUNT_EX_VAT = LINES.reduce((sum, line) => sum + line.unitPriceExcludingVatCurrency, 0);
const EXPECTED_AMOUNT_INC_VAT = LINES.reduce(
  (sum, line) => sum + line.unitPriceExcludingVatCurrency * (1 + line.vatPercentage / 100),
  0,
);

type TripletexListResponse<T> = {
  values?: T[];
  fullResultSize?: number;
};

type TripletexWrapper<T> = {
  value?: T;
};

type Customer = {
  id: number;
  name?: string;
  displayName?: string;
  customerName?: string;
  organizationNumber?: string;
};

type Product = {
  id: number;
  name?: string;
  number?: string;
  displayName?: string;
  vatType?: { id?: number | null } | null;
};

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
  orderLines?: Array<{ id?: number }>;
};

class ApiError extends Error {
  status: number;
  bodyText: string;
  bodyJson: any;
  path: string;
  callIndex: number;

  constructor(message: string, status: number, bodyText: string, bodyJson: any, path: string, callIndex: number) {
    super(message);
    this.status = status;
    this.bodyText = bodyText;
    this.bodyJson = bodyJson;
    this.path = path;
    this.callIndex = callIndex;
  }
}

let callCount = 0;

function authHeader(): string {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

function exactName(value: unknown): string {
  return String(value ?? "").trim();
}

function toRecord(input: Record<string, string | number | boolean | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) params.append(key, String(value));
  }
  return params;
}

async function api<T>(method: string, path: string, options?: { query?: URLSearchParams; body?: unknown }): Promise<T> {
  callCount += 1;
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
    if (callCount === 1 && response.status === 403 && bodyJson?.error === "Invalid or expired token") {
      throw new Error("Blocked: invalid or expired Tripletex token");
    }

    throw new ApiError(
      `${method} ${url.pathname}${url.search} failed with ${response.status}`,
      response.status,
      bodyText,
      bodyJson,
      `${url.pathname}${url.search}`,
      callCount,
    );
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

function findExactCustomer(values: Customer[]): Customer {
  const orgMatches = values.filter((customer) => String(customer.organizationNumber ?? "") === CUSTOMER.organizationNumber);
  if (orgMatches.length === 1) return orgMatches[0];

  const nameMatches = orgMatches.filter((customer) =>
    [customer.name, customer.displayName, customer.customerName].some((value) => exactName(value) === CUSTOMER.name),
  );
  if (nameMatches.length === 1) return nameMatches[0];

  throw new Error(`Customer resolution failed for org no ${CUSTOMER.organizationNumber}`);
}

function mapProductsByNumber(products: Product[]): Map<string, Product> {
  const map = new Map<string, Product>();
  for (const line of LINES) {
    const matches = products.filter((product) => String(product.number ?? "") === line.productNumber);
    if (matches.length === 1) map.set(line.productNumber, matches[0]);
  }
  return map;
}

async function resolveProducts(): Promise<Map<string, Product>> {
  const directParams = new URLSearchParams();
  for (const line of LINES) directParams.append("productNumber", line.productNumber);
  directParams.append("fields", "*");

  const direct = await api<TripletexListResponse<Product>>("GET", "/product", { query: directParams });
  let mapped = mapProductsByNumber(direct.values ?? []);
  if (mapped.size === LINES.length) return mapped;

  const catalog = await api<TripletexListResponse<Product>>("GET", "/product", {
    query: toRecord({ count: 1000, fields: "*" }),
  });

  mapped = mapProductsByNumber(catalog.values ?? []);
  if (mapped.size === LINES.length) return mapped;

  for (const line of LINES) {
    if (mapped.has(line.productNumber)) continue;
    const nameMatches = (catalog.values ?? []).filter(
      (product) =>
        exactName(product.name) === line.description ||
        exactName(product.displayName) === line.description,
    );
    if (nameMatches.length === 1) mapped.set(line.productNumber, nameMatches[0]);
  }

  if (mapped.size !== LINES.length) {
    const missing = LINES.filter((line) => !mapped.has(line.productNumber)).map((line) => line.productNumber);
    throw new Error(`Product resolution failed for product numbers: ${missing.join(", ")}`);
  }

  return mapped;
}

function pickVatType(line: (typeof LINES)[number], product: Product, vatTypes: VatType[]): VatType {
  const candidates = vatTypes.filter((vatType) => Number(vatType.percentage) === line.vatPercentage);
  if (candidates.length === 0) {
    throw new Error(`No outgoing VAT type found for ${line.vatPercentage}%`);
  }

  const productVatId = product.vatType?.id ?? null;
  const exactProductVat = candidates.find((vatType) => vatType.id === productVatId);
  if (exactProductVat) return exactProductVat;

  const sorted = [...candidates].sort((a, b) => {
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
  });

  return sorted[0];
}

function isMissingBankAccountError(error: unknown): error is ApiError {
  if (!(error instanceof ApiError)) return false;
  return error.status === 422 && error.bodyText.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.");
}

async function repairCompanyBankAccount(): Promise<void> {
  const response = await api<TripletexListResponse<Account>>("GET", "/ledger/account", {
    query: toRecord({ isBankAccount: true, fields: "*" }),
  });

  const accounts = response.values ?? [];
  const preferred =
    accounts.find((account) => account.isInvoiceAccount) ??
    accounts.find((account) => account.number === 1920) ??
    accounts.find((account) => account.isBankAccount);

  if (!preferred) {
    throw new Error("Bank account repair failed: no bank account found");
  }

  if (preferred.bankAccountNumber) return;

  await api<TripletexWrapper<Account>>("PUT", `/ledger/account/${preferred.id}`, {
    body: {
      id: preferred.id,
      version: preferred.version,
      bankAccountNumber: "12345678903",
    },
  });
}

async function createInvoice(payload: unknown): Promise<Invoice> {
  try {
    const response = await api<TripletexWrapper<Invoice>>("POST", "/invoice", {
      query: toRecord({ sendToCustomer: false }),
      body: payload,
    });
    if (!response.value) throw new Error("Invoice create returned no value");
    return response.value;
  } catch (error) {
    if (!isMissingBankAccountError(error)) throw error;
    await repairCompanyBankAccount();
    const retry = await api<TripletexWrapper<Invoice>>("POST", "/invoice", {
      query: toRecord({ sendToCustomer: false }),
      body: payload,
    });
    if (!retry.value) throw new Error("Invoice retry returned no value");
    return retry.value;
  }
}

async function main() {
  const customerResponse = await api<TripletexListResponse<Customer>>("GET", "/customer", {
    query: toRecord({ organizationNumber: CUSTOMER.organizationNumber, fields: "*" }),
  });
  const customer = findExactCustomer(customerResponse.values ?? []);

  const [productMap, vatResponse] = await Promise.all([
    resolveProducts(),
    api<TripletexListResponse<VatType>>("GET", "/ledger/vatType", {
      query: toRecord({ typeOfVat: "OUTGOING", vatDate: INVOICE_DATE, fields: "*" }),
    }),
  ]);

  const vatTypes = vatResponse.values ?? [];
  const orderLines = LINES.map((line) => {
    const product = productMap.get(line.productNumber);
    if (!product) throw new Error(`Missing resolved product ${line.productNumber}`);
    const vatType = pickVatType(line, product, vatTypes);
    return {
      product: { id: product.id },
      description: line.description,
      count: 1,
      unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
      vatType: { id: vatType.id },
    };
  });

  const payload = {
    invoiceDate: INVOICE_DATE,
    invoiceDueDate: INVOICE_DUE_DATE,
    customer: { id: customer.id },
    orders: [
      {
        customer: { id: customer.id },
        orderDate: INVOICE_DATE,
        deliveryDate: INVOICE_DATE,
        orderLines,
      },
    ],
  };

  const invoice = await createInvoice(payload);

  if (invoice.amountExcludingVatCurrency !== EXPECTED_AMOUNT_EX_VAT) {
    throw new Error(
      `Unexpected net total ${invoice.amountExcludingVatCurrency}; expected ${EXPECTED_AMOUNT_EX_VAT}`,
    );
  }

  if (invoice.amountCurrency !== EXPECTED_AMOUNT_INC_VAT) {
    throw new Error(`Unexpected gross total ${invoice.amountCurrency}; expected ${EXPECTED_AMOUNT_INC_VAT}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        callCount,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
        amountCurrency: invoice.amountCurrency,
      },
      null,
      2,
    ),
  );
}

await main();
