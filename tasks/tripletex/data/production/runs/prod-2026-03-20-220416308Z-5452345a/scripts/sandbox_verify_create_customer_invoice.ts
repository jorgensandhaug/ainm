const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2/";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const INVOICE_DATE = "2026-03-20";
const INVOICE_DUE_DATE = "2026-04-03";

const CUSTOMER = {
  name: "Sierra SL",
  organizationNumber: "861379760",
  email: "sierra-sl-861379760@example.com",
};

const LINES = [
  { ref: "2109", name: "Mantenimiento", price: 27500 },
  { ref: "1175", name: "Horas de consultoría", price: 3900 },
  { ref: "9974", name: "Informe de análisis", price: 3400 },
] as const;

function authHeader() {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

function productRefOf(product: Record<string, unknown>) {
  const raw = product.number ?? product.productNumber;
  return typeof raw === "string" ? raw : String(raw ?? "");
}

async function api(
  path: string,
  init: {
    method?: string;
    query?: Record<string, string | number | Array<string | number> | undefined>;
    body?: unknown;
  } = {},
) {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(JSON.stringify({ status: response.status, body: json ?? text }));
  }
  return json;
}

function valuesOf<T>(payload: unknown): T[] {
  if (
    payload &&
    typeof payload === "object" &&
    "values" in payload &&
    Array.isArray((payload as { values?: unknown }).values)
  ) {
    return (payload as { values: T[] }).values;
  }
  return [];
}

function valueOf<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "value" in payload) {
    return (payload as { value: T }).value;
  }
  return payload as T;
}

async function ensureCustomer() {
  const search = await api("customer", {
    query: { organizationNumber: CUSTOMER.organizationNumber, fields: "*" },
  });
  const existing = valuesOf<Record<string, unknown>>(search).find(
    (customer) => String(customer.organizationNumber ?? "") === CUSTOMER.organizationNumber,
  );
  if (existing) return existing;

  const created = await api("customer", {
    method: "POST",
    body: CUSTOMER,
  });
  return valueOf<Record<string, unknown>>(created);
}

async function ensureVatZero() {
  const payload = await api("ledger/vatType", {
    query: {
      typeOfVat: "OUTGOING",
      vatDate: INVOICE_DATE,
      fields: "*",
    },
  });
  const vatZero = valuesOf<Record<string, unknown>>(payload).find(
    (vatType) => Number(vatType.percentage) === 0,
  );
  if (!vatZero) throw new Error("Missing 0% outgoing VAT row in sandbox");
  return vatZero;
}

async function ensureProducts(vatZeroId: number) {
  const search = await api("product", {
    query: {
      productNumber: LINES.map((line) => line.ref),
      fields: "*",
    },
  });
  const existing = valuesOf<Record<string, unknown>>(search);
  const byRef = new Map(existing.map((product) => [productRefOf(product), product]));

  for (const line of LINES) {
    if (byRef.has(line.ref)) continue;
    const created = await api("product", {
      method: "POST",
      body: {
        name: line.name,
        number: line.ref,
        priceExcludingVatCurrency: line.price,
        vatType: { id: vatZeroId },
      },
    });
    byRef.set(line.ref, valueOf<Record<string, unknown>>(created));
  }

  return byRef;
}

async function provePath() {
  const calls: string[] = [];

  const customerPayload = await api("customer", {
    query: { organizationNumber: CUSTOMER.organizationNumber, fields: "*" },
  });
  calls.push("GET /customer?organizationNumber=861379760&fields=*");
  const customer = valuesOf<Record<string, unknown>>(customerPayload)[0];
  if (!customer) throw new Error("Proof customer lookup failed");

  const productPayload = await api("product", {
    query: {
      productNumber: LINES.map((line) => line.ref),
      fields: "*",
    },
  });
  calls.push("GET /product?productNumber=2109&productNumber=1175&productNumber=9974&fields=*");
  const products = valuesOf<Record<string, unknown>>(productPayload);
  if (products.length !== 3) throw new Error(`Proof product lookup returned ${products.length} products`);
  const productMap = new Map(products.map((product) => [productRefOf(product), product]));

  const vatPayload = await api("ledger/vatType", {
    query: {
      typeOfVat: "OUTGOING",
      vatDate: INVOICE_DATE,
      fields: "*",
    },
  });
  calls.push("GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*");
  const vatZero = valuesOf<Record<string, unknown>>(vatPayload).find(
    (vatType) => Number(vatType.percentage) === 0,
  );
  if (!vatZero) throw new Error("Proof VAT lookup did not return 0%");

  const invoicePayload = await api("invoice", {
    method: "POST",
    query: { sendToCustomer: "false" },
    body: {
      invoiceDate: INVOICE_DATE,
      invoiceDueDate: INVOICE_DUE_DATE,
      customer: { id: Number(customer.id) },
      orders: [
        {
          customer: { id: Number(customer.id) },
          orderDate: INVOICE_DATE,
          deliveryDate: INVOICE_DATE,
          orderLines: LINES.map((line) => ({
            product: { id: Number(productMap.get(line.ref)?.id) },
            description: line.name,
            count: 1,
            unitPriceExcludingVatCurrency: line.price,
            vatType: { id: Number(vatZero.id) },
          })),
        },
      ],
    },
  });
  calls.push("POST /invoice?sendToCustomer=false");

  const invoice = valueOf<Record<string, unknown>>(invoicePayload);
  return {
    calls,
    invoice: {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
      amountCurrency: invoice.amountCurrency,
      orderLines: invoice.orderLines,
    },
    vatTypes: valuesOf<Record<string, unknown>>(vatPayload).map((vatType) => ({
      id: vatType.id,
      number: vatType.number,
      percentage: vatType.percentage,
      name: vatType.name,
    })),
  };
}

const vatZero = await ensureVatZero();
const customer = await ensureCustomer();
const products = await ensureProducts(Number(vatZero.id));
const proof = await provePath();

console.log(
  JSON.stringify(
    {
      setup: {
        customerId: customer.id,
        productIds: LINES.map((line) => ({
          ref: line.ref,
          id: products.get(line.ref)?.id,
        })),
        vatZeroId: vatZero.id,
      },
      proof,
    },
    null,
    2,
  ),
);
