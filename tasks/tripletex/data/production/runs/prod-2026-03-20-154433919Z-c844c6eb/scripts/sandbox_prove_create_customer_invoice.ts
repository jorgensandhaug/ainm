import { Buffer } from "node:buffer";

const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const INVOICE_DATE = "2026-03-20";
const INVOICE_DUE_DATE = "2026-04-03";

const CUSTOMER = {
  name: "Floresta Lda",
  organizationNumber: "919172657",
  email: "floresta@example.no",
};

const LINES = [
  {
    ref: "4783",
    name: "Sessão de formação",
    unitPriceExcludingVatCurrency: 24900,
  },
  {
    ref: "3343",
    name: "Armazenamento na nuvem",
    unitPriceExcludingVatCurrency: 14050,
  },
  {
    ref: "4380",
    name: "Serviço de rede",
    unitPriceExcludingVatCurrency: 15750,
  },
] as const;

type AnyRecord = Record<string, any>;

class ApiError extends Error {
  status: number;
  body: any;

  constructor(status: number, body: any, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

async function api(method: string, path: string, body?: unknown) {
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
  const parsed = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiError(response.status, parsed ?? text, `${method} ${path} failed`);
  }
  return parsed;
}

function unwrapList(payload: any) {
  return Array.isArray(payload?.values) ? payload.values : [];
}

function unwrapValue(payload: any) {
  return payload?.value;
}

function normalize(value: string | undefined | null) {
  return (value ?? "").normalize("NFC").trim();
}

function sameText(a: string | undefined | null, b: string | undefined | null) {
  return normalize(a) === normalize(b);
}

function sameNumeric(a: string | number | undefined | null, b: string | number | undefined | null) {
  return String(a ?? "") === String(b ?? "");
}

async function getOutgoingVatTypes() {
  const params = new URLSearchParams({
    typeOfVat: "OUTGOING",
    vatDate: INVOICE_DATE,
    fields: "*",
  });
  return unwrapList(await api("GET", `/ledger/vatType?${params.toString()}`));
}

async function ensureCustomer() {
  const params = new URLSearchParams({
    organizationNumber: CUSTOMER.organizationNumber,
    fields: "*",
  });
  const existing = unwrapList(await api("GET", `/customer?${params.toString()}`));
  if (existing.length > 0) return existing[0];

  const created = unwrapValue(
    await api("POST", "/customer", {
      name: CUSTOMER.name,
      email: CUSTOMER.email,
      organizationNumber: CUSTOMER.organizationNumber,
    }),
  );
  return created;
}

async function searchProducts() {
  const params = new URLSearchParams({ fields: "*" });
  for (const line of LINES) params.append("productNumber", line.ref);
  return unwrapList(await api("GET", `/product?${params.toString()}`));
}

async function ensureProducts(vatTypeId: number) {
  const existing = await searchProducts();
  const byNumber = new Map(existing.map((product: AnyRecord) => [String(product.number), product]));

  for (const line of LINES) {
    if (byNumber.has(line.ref)) continue;
    const created = unwrapValue(
      await api("POST", "/product", {
        name: line.name,
        number: line.ref,
        priceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
        vatType: { id: vatTypeId },
      }),
    );
    byNumber.set(String(created.number), created);
  }

  return Array.from(byNumber.values());
}

function pickInvoiceAccount(accounts: AnyRecord[]) {
  return (
    accounts.find((account) => account.isInvoiceAccount) ??
    accounts.find((account) => String(account.number ?? "") === "1920") ??
    accounts.find((account) => account.isBankAccount) ??
    null
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

function generateUniqueBankAccountNumber(existing: string[]) {
  const taken = new Set(existing.filter(Boolean));
  let seed = "2234567800";
  for (let attempt = 0; attempt < 100000; attempt += 1) {
    const check = computeNorwegianBankChecksum(seed);
    if (check !== null) {
      const candidate = `${seed}${check}`;
      if (!taken.has(candidate)) return candidate;
    }
    seed = String((BigInt(seed) + 1n) % 10000000000n).padStart(10, "0");
  }
  throw new Error("Failed to generate bank account number");
}

function isMissingBankAccount(error: unknown) {
  const body =
    error instanceof ApiError
      ? typeof error.body === "string"
        ? error.body
        : JSON.stringify(error.body)
      : "";
  return body.includes(
    "Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.",
  );
}

async function createInvoice(customerId: number, products: AnyRecord[], vatTypeId: number) {
  const productMap = new Map(products.map((product) => [String(product.number), product]));
  const payload = {
    invoiceDate: INVOICE_DATE,
    invoiceDueDate: INVOICE_DUE_DATE,
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        orderDate: INVOICE_DATE,
        deliveryDate: INVOICE_DATE,
        orderLines: LINES.map((line) => ({
          product: { id: productMap.get(line.ref)!.id },
          description: line.name,
          count: 1,
          unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
          vatType: { id: vatTypeId },
        })),
      },
    ],
  };

  return unwrapValue(await api("POST", "/invoice?sendToCustomer=false", payload));
}

async function repairBankAccount() {
  const accounts = unwrapList(
    await api(
      "GET",
      `/ledger/account?${new URLSearchParams({ isBankAccount: "true", fields: "*" }).toString()}`,
    ),
  );
  const account = pickInvoiceAccount(accounts);
  if (!account) throw new Error("No bank account available for repair");
  const bankAccountNumber = generateUniqueBankAccountNumber(
    accounts.map((account) => String(account.bankAccountNumber ?? "")),
  );
  const updated = unwrapValue(
    await api("PUT", `/ledger/account/${account.id}`, { bankAccountNumber }),
  );
  return updated;
}

async function getInvoice(id: number) {
  const fields =
    "*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))";
  return unwrapValue(
    await api("GET", `/invoice/${id}?${new URLSearchParams({ fields }).toString()}`),
  );
}

function collectLines(invoice: AnyRecord) {
  const nested = Array.isArray(invoice.orders)
    ? invoice.orders.flatMap((order: AnyRecord) => order.orderLines ?? [])
    : [];
  return nested.length > 0 ? nested : invoice.orderLines ?? [];
}

async function main() {
  const outgoingVatTypes = await getOutgoingVatTypes();
  const zeroVat = outgoingVatTypes.find((vatType: AnyRecord) => Number(vatType.percentage) === 0);
  if (!zeroVat) throw new Error("Sandbox has no 0% outgoing VAT type");

  const customer = await ensureCustomer();
  await ensureProducts(zeroVat.id);

  const resolvedCustomer = unwrapList(
    await api(
      "GET",
      `/customer?${new URLSearchParams({
        organizationNumber: CUSTOMER.organizationNumber,
        fields: "*",
      }).toString()}`,
    ),
  )[0];
  const resolvedProducts = await searchProducts();

  let invoiceWrite: AnyRecord;
  let repairedAccount: AnyRecord | null = null;
  try {
    invoiceWrite = await createInvoice(resolvedCustomer.id, resolvedProducts, zeroVat.id);
  } catch (error) {
    if (!isMissingBankAccount(error)) throw error;
    repairedAccount = await repairBankAccount();
    invoiceWrite = await createInvoice(resolvedCustomer.id, resolvedProducts, zeroVat.id);
  }

  const invoice = await getInvoice(invoiceWrite.id);
  const invoiceLines = collectLines(invoice).map((line: AnyRecord) => ({
    productNumber: line.product?.number,
    description: line.description,
    unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
    vatTypeId: line.vatType?.id,
    vatPercentage: line.vatType?.percentage,
  }));

  console.log(
    JSON.stringify(
      {
        outgoingVatTypes: outgoingVatTypes.map((vatType: AnyRecord) => ({
          id: vatType.id,
          number: vatType.number,
          name: vatType.name,
          percentage: vatType.percentage,
        })),
        resolvedCustomer: {
          id: resolvedCustomer.id,
          name: resolvedCustomer.name,
          organizationNumber: resolvedCustomer.organizationNumber,
        },
        resolvedProducts: resolvedProducts.map((product: AnyRecord) => ({
          id: product.id,
          number: product.number,
          name: product.name,
          vatType: product.vatType,
        })),
        repairedAccount: repairedAccount
          ? {
              id: repairedAccount.id,
              number: repairedAccount.number,
              bankAccountNumber: repairedAccount.bankAccountNumber,
            }
          : null,
        invoiceWrite: {
          id: invoiceWrite.id,
          invoiceNumber: invoiceWrite.invoiceNumber,
          amountExcludingVatCurrency: invoiceWrite.amountExcludingVatCurrency,
          amountCurrency: invoiceWrite.amountCurrency,
          orderLines: invoiceWrite.orderLines,
        },
        invoiceRead: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
          amountCurrency: invoice.amountCurrency,
          orderLines: invoiceLines,
        },
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
  console.error(String(error));
  process.exit(1);
});
