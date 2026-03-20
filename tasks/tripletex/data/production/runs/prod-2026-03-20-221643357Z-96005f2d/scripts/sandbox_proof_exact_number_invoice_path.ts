const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const INVOICE_DATE = "2026-03-20";
const INVOICE_DUE_DATE = "2026-04-03";

const CUSTOMER = {
  name: "Havbris Sandbox AS",
  organizationNumber: "977448240",
  email: "havbris.sandbox@example.org",
};

const PRODUCTS = [
  {
    name: "Konsulenttimer",
    number: "96390",
    priceExcludingVatCurrency: 2850,
  },
  {
    name: "Systemutvikling",
    number: "91652",
    priceExcludingVatCurrency: 2650,
  },
  {
    name: "Webdesign",
    number: "93273",
    priceExcludingVatCurrency: 7400,
  },
] as const;

type ApiOptions = {
  query?: Record<string, string | number | Array<string | number>>;
  body?: unknown;
  expectedStatuses?: number[];
};

type Customer = {
  id: number;
  name?: string;
  organizationNumber?: string;
};

type Product = {
  id: number;
  name?: string;
  number?: string | number;
  productNumber?: string | number;
  vatType?: { id?: number; percentage?: number };
};

let totalCalls = 0;

async function api<T = unknown>(
  method: string,
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, String(item));
      }
      continue;
    }
    params.set(key, String(value));
  }

  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const url = new URL(path, base);
  if ([...params.keys()].length > 0) {
    url.search = params.toString();
  }

  totalCalls += 1;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${btoa(`0:${SESSION_TOKEN}`)}`,
      Accept: "application/json",
      ...(options.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  const expected = options.expectedStatuses ?? [200];
  if (!expected.includes(response.status)) {
    throw new Error(
      JSON.stringify(
        { method, path, status: response.status, body },
        null,
        2,
      ),
    );
  }
  return body as T;
}

function unwrapValues<T>(payload: unknown): T[] {
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as Record<string, unknown>).values)
  ) {
    return (payload as { values: T[] }).values;
  }
  return [];
}

function unwrapValue<T>(payload: unknown): T {
  return (payload as { value: T }).value;
}

function normalizeNumber(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value).trim();
}

async function ensureCustomer(): Promise<Customer> {
  const search = await api("GET", "customer", {
    query: {
      organizationNumber: CUSTOMER.organizationNumber,
      fields: "*",
    },
  });

  const existing = unwrapValues<Customer>(search).find(
    (customer) => customer.organizationNumber === CUSTOMER.organizationNumber,
  );
  if (existing) {
    return existing;
  }

  const created = await api("POST", "customer", {
    body: CUSTOMER,
    expectedStatuses: [200, 201],
  });
  return unwrapValue<Customer>(created);
}

async function resolveOutgoingZeroVatId(): Promise<number> {
  const vat = await api("GET", "ledger/vatType", {
    query: {
      typeOfVat: "OUTGOING",
      vatDate: INVOICE_DATE,
      fields: "*",
    },
  });
  const row = unwrapValues<{ id: number; percentage?: number }>(vat).find(
    (item) => item.percentage === 0,
  );
  if (!row) {
    throw new Error("Outgoing 0% VAT not found in sandbox");
  }
  return row.id;
}

async function ensureProducts(zeroVatId: number): Promise<void> {
  const search = await api("GET", "product", {
    query: {
      productNumber: PRODUCTS.map((product) => product.number),
      fields: "*",
    },
  });
  const existing = unwrapValues<Product>(search);

  for (const target of PRODUCTS) {
    const found = existing.find((product) => {
      const number =
        normalizeNumber(product.number) ??
        normalizeNumber(product.productNumber);
      return number === target.number && product.name === target.name;
    });

    if (found) {
      continue;
    }

    await api("POST", "product", {
      body: {
        name: target.name,
        number: target.number,
        priceExcludingVatCurrency: target.priceExcludingVatCurrency,
        vatType: { id: zeroVatId },
      },
      expectedStatuses: [200, 201],
    });
  }
}

async function proofRun(): Promise<{
  invoiceId: number;
  invoiceNumber: number | null;
  proofCalls: number;
  amountExcludingVatCurrency: number;
  amountCurrency: number;
  lineProof: Array<{
    description: string;
    productNumber: string | null;
    vatPercentage: number | null;
  }>;
}> {
  const startCalls = totalCalls;

  const customerSearch = await api("GET", "customer", {
    query: {
      organizationNumber: CUSTOMER.organizationNumber,
      fields: "*",
    },
  });
  const customer = unwrapValues<Customer>(customerSearch).find(
    (row) => row.organizationNumber === CUSTOMER.organizationNumber,
  );
  if (!customer) {
    throw new Error("Proof customer missing");
  }

  const productSearch = await api("GET", "product", {
    query: {
      productNumber: PRODUCTS.map((product) => product.number),
      fields: "*",
    },
  });
  const resolved = unwrapValues<Product>(productSearch);
  const lines = PRODUCTS.map((target) => {
    const product = resolved.find((row) => {
      const number =
        normalizeNumber(row.number) ?? normalizeNumber(row.productNumber);
      return number === target.number && row.name === target.name;
    });
    if (!product || typeof product.id !== "number" || typeof product.vatType?.id !== "number") {
      throw new Error(`Proof product missing for ${target.number}`);
    }
    return { target, product };
  });

  const created = await api("POST", "invoice", {
    query: {
      sendToCustomer: "false",
    },
    body: {
      invoiceDate: INVOICE_DATE,
      invoiceDueDate: INVOICE_DUE_DATE,
      customer: { id: customer.id },
      orders: [
        {
          customer: { id: customer.id },
          orderDate: INVOICE_DATE,
          deliveryDate: INVOICE_DATE,
          orderLines: lines.map(({ target, product }) => ({
            product: { id: product.id },
            description: target.name,
            count: 1,
            unitPriceExcludingVatCurrency: target.priceExcludingVatCurrency,
            vatType: { id: product.vatType!.id! },
          })),
        },
      ],
    },
    expectedStatuses: [200, 201],
  });

  const invoice = unwrapValue<Record<string, unknown>>(created);
  const invoiceId = Number(invoice.id);

  const readback = await api("GET", `invoice/${invoiceId}`, {
    query: {
      fields:
        "*,orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))",
    },
  });

  const expanded = unwrapValue<Record<string, unknown>>(readback);
  const orders = Array.isArray(expanded.orders)
    ? (expanded.orders as Array<Record<string, unknown>>)
    : [];
  const firstOrder = orders[0] ?? {};
  const orderLines = Array.isArray(firstOrder.orderLines)
    ? (firstOrder.orderLines as Array<Record<string, unknown>>)
    : [];

  const lineProof = orderLines.map((line) => {
    const product =
      line.product && typeof line.product === "object"
        ? (line.product as Record<string, unknown>)
        : {};
    const vatType =
      line.vatType && typeof line.vatType === "object"
        ? (line.vatType as Record<string, unknown>)
        : {};
    return {
      description: String(line.description ?? ""),
      productNumber: normalizeNumber(product.number),
      vatPercentage:
        typeof vatType.percentage === "number" ? vatType.percentage : null,
    };
  });

  return {
    invoiceId,
    invoiceNumber:
      typeof invoice.invoiceNumber === "number" ? invoice.invoiceNumber : null,
    proofCalls: totalCalls - startCalls,
    amountExcludingVatCurrency: Number(invoice.amountExcludingVatCurrency),
    amountCurrency: Number(invoice.amountCurrency),
    lineProof,
  };
}

const customer = await ensureCustomer();
const zeroVatId = await resolveOutgoingZeroVatId();
await ensureProducts(zeroVatId);
const proof = await proofRun();

console.log(
  JSON.stringify(
    {
      ok: true,
      customerId: customer.id,
      zeroVatId,
      totalCalls,
      proof,
    },
    null,
    2,
  ),
);
