const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const INVOICE_DATE = "2026-03-20";
const INVOICE_DUE_DATE = "2026-04-03";
const CUSTOMER = {
  name: "Lumière SARL",
  organizationNumber: "925760838",
  email: "lumiere.sarl.sandbox@example.com",
};
const PRODUCTS = [
  { promptRef: "3644", number: "93644", name: "Maintenance", price: 1850 },
  { promptRef: "4934", number: "94934", name: "Licence logicielle", price: 14850 },
  { promptRef: "8806", number: "98806", name: "Service réseau", price: 17250 },
] as const;
const BANK_ACCOUNT_REPAIR_NUMBER = "12345678903";

let callCount = 0;
let proofCallCount = 0;

function authHeader() {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

function buildUrl(path: string, query?: Record<string, string | string[] | number | boolean | undefined>) {
  const normalizedPath = path.replace(/^\/+/, "");
  const url = new URL(normalizedPath, `${BASE_URL.replace(/\/+$/, "")}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, String(item));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url;
}

async function api<T = unknown>(
  method: string,
  path: string,
  options: {
    query?: Record<string, string | string[] | number | boolean | undefined>;
    body?: unknown;
    expectedStatuses?: number[];
    phase?: "setup" | "proof";
  } = {},
) {
  callCount += 1;
  if (options.phase === "proof") proofCallCount += 1;

  const response = await fetch(buildUrl(path, options.query), {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  const expected = new Set(options.expectedStatuses ?? [200]);
  if (!expected.has(response.status)) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${text}`);
  }
  return data as T;
}

function getValues<T>(payload: unknown): T[] {
  return Array.isArray((payload as { values?: unknown[] })?.values)
    ? ((payload as { values: T[] }).values ?? [])
    : [];
}

function getValue<T>(payload: unknown): T {
  return (payload as { value: T }).value;
}

async function getOutgoingZeroVatId() {
  const vatPayload = await api<{ values: Array<Record<string, unknown>> }>("GET", "/ledger/vatType", {
    query: { typeOfVat: "OUTGOING", vatDate: INVOICE_DATE, fields: "*" },
    phase: "setup",
  });
  const vat = getValues<Record<string, unknown>>(vatPayload).find((entry) => Number(entry.percentage) === 0);
  if (!vat?.id) throw new Error("No outgoing 0% VAT type in sandbox");
  return Number(vat.id);
}

async function ensureCustomer() {
  const found = await api<{ values: Array<Record<string, unknown>> }>("GET", "/customer", {
    query: { organizationNumber: CUSTOMER.organizationNumber, fields: "*" },
    phase: "setup",
  });
  const existing = getValues<Record<string, unknown>>(found).find(
    (customer) =>
      String(customer.organizationNumber ?? "") === CUSTOMER.organizationNumber &&
      String(customer.name ?? "") === CUSTOMER.name,
  );
  if (existing?.id) return Number(existing.id);

  const created = await api<{ value: Record<string, unknown> }>("POST", "/customer", {
    body: CUSTOMER,
    expectedStatuses: [200, 201],
    phase: "setup",
  });
  return Number(getValue<Record<string, unknown>>(created).id);
}

async function ensureProducts(vatTypeId: number) {
  const catalog = await api<{ values: Array<Record<string, unknown>> }>("GET", "/product", {
    query: { count: 1000, fields: "*" },
    phase: "setup",
  });
  const values = getValues<Record<string, unknown>>(catalog);
  const resolved = new Map<string, number>();

  for (const spec of PRODUCTS) {
    const existing = values.find((product) => String(product.name ?? "") === spec.name);
    if (existing?.id) {
      resolved.set(spec.name, Number(existing.id));
      continue;
    }

    const created = await api<{ value: Record<string, unknown> }>("POST", "/product", {
      body: {
        name: spec.name,
        number: spec.number,
        priceExcludingVatCurrency: spec.price,
        vatType: { id: vatTypeId },
      },
      expectedStatuses: [200, 201],
      phase: "setup",
    });
    resolved.set(spec.name, Number(getValue<Record<string, unknown>>(created).id));
  }

  return resolved;
}

async function repairBankAccount() {
  const accountsPayload = await api<{ values: Array<Record<string, unknown>> }>("GET", "/ledger/account", {
    query: { isBankAccount: true, fields: "*" },
    phase: "proof",
  });
  const accounts = getValues<Record<string, unknown>>(accountsPayload);
  const account =
    accounts.find((entry) => entry.isInvoiceAccount === true) ??
    accounts.find((entry) => String(entry.number ?? "") === "1920") ??
    accounts[0];
  if (!account?.id) throw new Error("No bank account available for repair");

  await api("PUT", `/ledger/account/${account.id}`, {
    body: { bankAccountNumber: BANK_ACCOUNT_REPAIR_NUMBER },
    expectedStatuses: [200],
    phase: "proof",
  });
}

async function main() {
  const zeroVatId = await getOutgoingZeroVatId();
  await ensureCustomer();
  await ensureProducts(zeroVatId);

  const customerPayload = await api<{ values: Array<Record<string, unknown>> }>("GET", "/customer", {
    query: { organizationNumber: CUSTOMER.organizationNumber, fields: "*" },
    phase: "proof",
  });
  const customer = getValues<Record<string, unknown>>(customerPayload).find(
    (entry) =>
      String(entry.organizationNumber ?? "") === CUSTOMER.organizationNumber && String(entry.name ?? "") === CUSTOMER.name,
  );
  if (!customer?.id) throw new Error("Proof customer not resolved");

  const productCatalogPayload = await api<{ values: Array<Record<string, unknown>> }>("GET", "/product", {
    query: { count: 1000, fields: "*" },
    phase: "proof",
  });
  const catalog = getValues<Record<string, unknown>>(productCatalogPayload);
  const products = PRODUCTS.map((spec) => {
    const product = catalog.find((entry) => String(entry.name ?? "") === spec.name);
    if (!product?.id) throw new Error(`Proof product not resolved by exact name: ${spec.name}`);
    return { spec, id: Number(product.id) };
  });

  const vatPayload = await api<{ values: Array<Record<string, unknown>> }>("GET", "/ledger/vatType", {
    query: { typeOfVat: "OUTGOING", vatDate: INVOICE_DATE, fields: "*" },
    phase: "proof",
  });
  const vat = getValues<Record<string, unknown>>(vatPayload).find((entry) => Number(entry.percentage) === 0);
  if (!vat?.id) throw new Error("Proof VAT type not resolved");

  const invoiceBody = {
    invoiceDate: INVOICE_DATE,
    invoiceDueDate: INVOICE_DUE_DATE,
    customer: { id: Number(customer.id) },
    orders: [
      {
        customer: { id: Number(customer.id) },
        orderDate: INVOICE_DATE,
        deliveryDate: INVOICE_DATE,
        orderLines: products.map(({ spec, id }) => ({
          product: { id },
          description: spec.name,
          count: 1,
          unitPriceExcludingVatCurrency: spec.price,
          vatType: { id: Number(vat.id) },
        })),
      },
    ],
  };

  let invoicePayload;
  try {
    invoicePayload = await api<{ value: Record<string, unknown> }>("POST", "/invoice", {
      query: { sendToCustomer: false },
      body: invoiceBody,
      expectedStatuses: [200, 201],
      phase: "proof",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer")) {
      throw error;
    }
    await repairBankAccount();
    invoicePayload = await api<{ value: Record<string, unknown> }>("POST", "/invoice", {
      query: { sendToCustomer: false },
      body: invoiceBody,
      expectedStatuses: [200, 201],
      phase: "proof",
    });
  }

  const invoice = getValue<Record<string, unknown>>(invoicePayload);
  console.log(
    JSON.stringify(
      {
        ok: true,
        totalCallCount: callCount,
        proofCallCount,
        proofPath: [
          "GET /customer?organizationNumber=925760838&fields=*",
          "GET /product?count=1000&fields=*",
          "GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*",
          "POST /invoice?sendToCustomer=false",
        ],
        note: "Sandbox analog proves exact-name catalog resolution when parenthetical refs are not real product numbers or ids. This account exposes only 0% outgoing VAT, so mixed 25/15/0 VAT cannot be replayed here.",
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
