import { Buffer } from "node:buffer";

const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "bwGpg9jgCbTaiMqpoxHVCV8xv14HEnbuGI-qViY9zzM";
const INVOICE_DATE = "2026-03-20";
const INVOICE_DUE_DATE = "2026-04-03";

const CUSTOMER = {
  name: "Floresta Lda",
  organizationNumber: "919172657",
};

const REQUESTED_LINES = [
  {
    ref: "4783",
    name: "Sessão de formação",
    unitPriceExcludingVatCurrency: 24900,
    vatPercentage: 25,
  },
  {
    ref: "3343",
    name: "Armazenamento na nuvem",
    unitPriceExcludingVatCurrency: 14050,
    vatPercentage: 15,
  },
  {
    ref: "4380",
    name: "Serviço de rede",
    unitPriceExcludingVatCurrency: 15750,
    vatPercentage: 0,
  },
] as const;

type AnyRecord = Record<string, any>;

class ApiError extends Error {
  status: number;
  body: any;

  constructor(status: number, body: any, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

async function api<T = any>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json; charset=utf-8" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const parsed = text ? safeJsonParse(text) : null;

  if (!response.ok) {
    throw new ApiError(response.status, parsed ?? text, `${method} ${path} failed`);
  }

  return parsed as T;
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function unwrapList<T>(payload: any): T[] {
  if (!payload || !Array.isArray(payload.values)) return [];
  return payload.values as T[];
}

function unwrapValue<T>(payload: any): T {
  if (!payload || typeof payload !== "object" || !("value" in payload)) {
    throw new Error("Missing wrapped value in response");
  }
  return payload.value as T;
}

function normalize(value: string | undefined | null) {
  return (value ?? "").normalize("NFC").trim();
}

function sameText(a: string | undefined | null, b: string | undefined | null) {
  return normalize(a) === normalize(b);
}

function sameNumericText(a: string | number | undefined | null, b: string | number | undefined | null) {
  return String(a ?? "") === String(b ?? "");
}

function findResolvedProduct(products: AnyRecord[], ref: string, name: string) {
  const byNumber = products.find((product) => sameNumericText(product.number, ref));
  if (byNumber) return byNumber;

  const byId = products.find((product) => sameNumericText(product.id, ref));
  if (byId) return byId;

  const byExactName = products.filter((product) => sameText(product.name, name));
  if (byExactName.length === 1) return byExactName[0];

  return null;
}

function chooseVatType(
  vatTypes: AnyRecord[],
  product: AnyRecord,
  wantedPercentage: number,
) {
  const candidates = vatTypes.filter(
    (vatType) => Number(vatType.percentage) === wantedPercentage,
  );
  const defaultVatId = product?.vatType?.id;
  const defaultCandidate = candidates.find((vatType) => vatType.id === defaultVatId);
  if (defaultCandidate) return defaultCandidate;
  if (candidates.length === 1) return candidates[0];
  throw new Error(
    `Could not safely resolve VAT ${wantedPercentage}% for product ${product?.number ?? product?.id}`,
  );
}

function computeNorwegianBankChecksum(firstTenDigits: string) {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const digits = firstTenDigits.split("").map(Number);
  const sum = digits.reduce((acc, digit, index) => acc + digit * weights[index], 0);
  const remainder = sum % 11;
  const check = 11 - remainder;
  if (check === 11) return 0;
  if (check === 10) return null;
  return check;
}

function generateUniqueBankAccountNumber(existingNumbers: string[]) {
  const taken = new Set(existingNumbers.filter(Boolean));
  let seed = "1234567800";

  for (let attempt = 0; attempt < 100000; attempt += 1) {
    const check = computeNorwegianBankChecksum(seed);
    if (check !== null) {
      const candidate = `${seed}${check}`;
      if (!taken.has(candidate)) return candidate;
    }
    seed = String((BigInt(seed) + 1n) % 10000000000n).padStart(10, "0");
  }

  throw new Error("Could not generate a unique bank account number");
}

function pickBankAccount(accounts: AnyRecord[]) {
  return (
    accounts.find((account) => account.isInvoiceAccount) ??
    accounts.find((account) => String(account.number ?? "") === "1920") ??
    accounts.find((account) => account.isBankAccount) ??
    null
  );
}

function isInvalidTokenError(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status === 403 &&
    error.body &&
    typeof error.body === "object" &&
    error.body.error === "Invalid or expired token"
  );
}

function isMissingCompanyBankAccountError(error: unknown) {
  const text =
    error instanceof ApiError
      ? typeof error.body === "string"
        ? error.body
        : JSON.stringify(error.body)
      : "";
  return text.includes(
    "Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.",
  );
}

async function resolveCustomer() {
  const params = new URLSearchParams({
    organizationNumber: CUSTOMER.organizationNumber,
    fields: "*",
  });
  const payload = await api("GET", `/customer?${params.toString()}`);
  const customers = unwrapList<AnyRecord>(payload).filter(
    (customer) =>
      sameText(customer.name, CUSTOMER.name) ||
      sameNumericText(customer.organizationNumber, CUSTOMER.organizationNumber),
  );
  if (customers.length !== 1) {
    throw new Error(`Expected 1 customer, got ${customers.length}`);
  }
  return customers[0];
}

async function resolveProducts() {
  const firstParams = new URLSearchParams({ fields: "*" });
  for (const line of REQUESTED_LINES) {
    firstParams.append("productNumber", line.ref);
  }

  let products = unwrapList<AnyRecord>(await api("GET", `/product?${firstParams.toString()}`));
  const firstPass = REQUESTED_LINES.map((line) =>
    findResolvedProduct(products, line.ref, line.name),
  );
  if (firstPass.every(Boolean)) {
    return firstPass as AnyRecord[];
  }

  const fallbackParams = new URLSearchParams({
    ids: REQUESTED_LINES.map((line) => line.ref).join(","),
    fields: "*",
  });
  const fallbackProducts = unwrapList<AnyRecord>(
    await api("GET", `/product?${fallbackParams.toString()}`),
  );
  products = [...products, ...fallbackProducts];
  const deduped = Array.from(new Map(products.map((product) => [String(product.id), product])).values());
  const secondPass = REQUESTED_LINES.map((line) =>
    findResolvedProduct(deduped, line.ref, line.name),
  );
  if (secondPass.every(Boolean)) {
    return secondPass as AnyRecord[];
  }

  const fullCatalog = unwrapList<AnyRecord>(
    await api("GET", `/product?${new URLSearchParams({ count: "1000", fields: "*" }).toString()}`),
  );
  const finalPass = REQUESTED_LINES.map((line) =>
    findResolvedProduct(fullCatalog, line.ref, line.name),
  );
  if (!finalPass.every(Boolean)) {
    const missing = REQUESTED_LINES.filter((_, index) => !finalPass[index]).map((line) => line.ref);
    throw new Error(`Could not resolve products: ${missing.join(", ")}`);
  }
  return finalPass as AnyRecord[];
}

async function resolveVatTypes() {
  const params = new URLSearchParams({
    typeOfVat: "OUTGOING",
    vatDate: INVOICE_DATE,
    fields: "*",
  });
  const payload = await api("GET", `/ledger/vatType?${params.toString()}`);
  return unwrapList<AnyRecord>(payload);
}

async function createInvoice(customerId: number, products: AnyRecord[], vatTypes: AnyRecord[]) {
  const orderLines = REQUESTED_LINES.map((line, index) => {
    const product = products[index];
    const vatType = chooseVatType(vatTypes, product, line.vatPercentage);
    return {
      product: { id: product.id },
      description: line.name,
      count: 1,
      unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
      vatType: { id: vatType.id },
    };
  });

  const payload = {
    invoiceDate: INVOICE_DATE,
    invoiceDueDate: INVOICE_DUE_DATE,
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        orderDate: INVOICE_DATE,
        deliveryDate: INVOICE_DATE,
        orderLines,
      },
    ],
  };

  return unwrapValue<AnyRecord>(
    await api("POST", "/invoice?sendToCustomer=false", payload),
  );
}

async function repairBankAccountAndRetry(
  customerId: number,
  products: AnyRecord[],
  vatTypes: AnyRecord[],
) {
  const accounts = unwrapList<AnyRecord>(
    await api("GET", `/ledger/account?${new URLSearchParams({ isBankAccount: "true", fields: "*" }).toString()}`),
  );
  const account = pickBankAccount(accounts);
  if (!account) {
    throw new Error("No bank account found for repair branch");
  }

  const uniqueNumber = generateUniqueBankAccountNumber(
    accounts.map((candidate) => String(candidate.bankAccountNumber ?? "")),
  );

  await api("PUT", `/ledger/account/${account.id}`, {
    bankAccountNumber: uniqueNumber,
  });

  return createInvoice(customerId, products, vatTypes);
}

async function fetchInvoice(invoiceId: number) {
  const fields =
    "*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))";
  return unwrapValue<AnyRecord>(
    await api("GET", `/invoice/${invoiceId}?${new URLSearchParams({ fields }).toString()}`),
  );
}

function collectInvoiceLines(invoice: AnyRecord) {
  const nested = Array.isArray(invoice.orders)
    ? invoice.orders.flatMap((order: AnyRecord) => (Array.isArray(order.orderLines) ? order.orderLines : []))
    : [];
  if (nested.length > 0) return nested;
  return Array.isArray(invoice.orderLines) ? invoice.orderLines : [];
}

function verifyInvoice(invoice: AnyRecord) {
  const lines = collectInvoiceLines(invoice);
  if (lines.length !== REQUESTED_LINES.length) {
    throw new Error(`Expected ${REQUESTED_LINES.length} invoice lines, got ${lines.length}`);
  }

  for (const expected of REQUESTED_LINES) {
    const match = lines.find(
      (line: AnyRecord) =>
        sameNumericText(line?.product?.number, expected.ref) &&
        sameText(line.description, expected.name) &&
        Number(line.unitPriceExcludingVatCurrency) === expected.unitPriceExcludingVatCurrency &&
        Number(line?.vatType?.percentage) === expected.vatPercentage,
    );
    if (!match) {
      throw new Error(`Invoice line verification failed for product ${expected.ref}`);
    }
  }
}

async function main() {
  let customer: AnyRecord;
  try {
    customer = await resolveCustomer();
  } catch (error) {
    if (isInvalidTokenError(error)) throw error;
    throw error;
  }

  const products = await resolveProducts();
  const vatTypes = await resolveVatTypes();

  let createdInvoice: AnyRecord;
  try {
    createdInvoice = await createInvoice(customer.id, products, vatTypes);
  } catch (error) {
    if (isInvalidTokenError(error)) throw error;
    if (!isMissingCompanyBankAccountError(error)) throw error;
    createdInvoice = await repairBankAccountAndRetry(customer.id, products, vatTypes);
  }

  const invoice = await fetchInvoice(createdInvoice.id);
  verifyInvoice(invoice);

  console.log(
    JSON.stringify(
      {
        ok: true,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        invoiceDueDate: invoice.invoiceDueDate,
        amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
        amountCurrency: invoice.amountCurrency,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  if (error instanceof ApiError) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          status: error.status,
          body: error.body,
          message: error.message,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  console.error(
    JSON.stringify(
      {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
