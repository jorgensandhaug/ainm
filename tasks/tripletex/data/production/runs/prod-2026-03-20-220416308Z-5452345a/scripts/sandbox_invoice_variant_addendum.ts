const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2/";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const INVOICE_DATE = "2026-03-20";
const INVOICE_DUE_DATE = "2026-04-03";
const CUSTOMER = {
  name: "Sierra SL",
  organizationNumber: "861379760",
};
const LINES = [
  { ref: "2109", name: "Mantenimiento", price: 27500 },
  { ref: "1175", name: "Horas de consultoría", price: 3900 },
  { ref: "9974", name: "Informe de análisis", price: 3400 },
] as const;

function authHeader() {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
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
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const err = new Error(`HTTP ${response.status}`);
    (err as Error & { status?: number; body?: unknown }).status = response.status;
    (err as Error & { body?: unknown }).body = body ?? text;
    throw err;
  }
  return body;
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

function productRefOf(product: Record<string, unknown>) {
  const raw = product.number ?? product.productNumber;
  return typeof raw === "string" ? raw : String(raw ?? "");
}

const customerSearch = await api("customer", {
  query: { organizationNumber: CUSTOMER.organizationNumber, fields: "*" },
});
const existingCustomer = valuesOf<Record<string, unknown>>(customerSearch)[0];
const existingCustomerId = Number(existingCustomer.id);

const productSearch = await api("product", {
  query: { productNumber: LINES.map((line) => line.ref), fields: "*" },
});
const productMap = new Map(
  valuesOf<Record<string, unknown>>(productSearch).map((product) => [productRefOf(product), product]),
);

async function run(name: string, body: unknown) {
  try {
    const invoice = valueOf<Record<string, unknown>>(
      await api("invoice", {
        method: "POST",
        query: { sendToCustomer: "false" },
        body,
      }),
    );
    const detail = valueOf<Record<string, unknown>>(
      await api(`invoice/${Number(invoice.id)}`, {
        query: {
          fields:
            "*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))",
        },
      }),
    );
    const orderLines = Array.isArray(detail.orderLines)
      ? (detail.orderLines as Array<Record<string, unknown>>)
      : [];
    return {
      name,
      status: "success",
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
      amountCurrency: invoice.amountCurrency,
      customerId: (detail.customer as Record<string, unknown>).id,
      customerMatchesExisting: Number((detail.customer as Record<string, unknown>).id) === existingCustomerId,
      lineProducts: orderLines.map((line) =>
        ((line.product as Record<string, unknown> | undefined)?.number ??
          (line.product as Record<string, unknown> | undefined)?.productNumber ??
          null) as string | null,
      ),
      lineVatPercentages: orderLines.map((line) =>
        ((line.vatType as Record<string, unknown> | undefined)?.percentage ?? null) as number | null,
      ),
    };
  } catch (error) {
    return {
      name,
      status: "error",
      error:
        error instanceof Error
          ? {
              message: error.message,
              status: (error as Error & { status?: number }).status ?? null,
              body: (error as Error & { body?: unknown }).body ?? null,
            }
          : error,
    };
  }
}

const baseOrderLines = LINES.map((line) => ({
  product: { id: Number(productMap.get(line.ref)?.id) },
  description: line.name,
  count: 1,
  unitPriceExcludingVatCurrency: line.price,
}));

const results = [];

results.push(
  await run("two_call_product_lookup_then_inline_customer_name_org", {
    invoiceDate: INVOICE_DATE,
    invoiceDueDate: INVOICE_DUE_DATE,
    comment: "variant two_call_product_lookup_then_inline_customer_name_org",
    customer: CUSTOMER,
    orders: [
      {
        customer: CUSTOMER,
        orderDate: INVOICE_DATE,
        deliveryDate: INVOICE_DATE,
        orderLines: baseOrderLines,
      },
    ],
  }),
);

results.push(
  await run("two_call_product_lookup_then_inline_customer_name_org_no_order_customer", {
    invoiceDate: INVOICE_DATE,
    invoiceDueDate: INVOICE_DUE_DATE,
    comment: "variant two_call_product_lookup_then_inline_customer_name_org_no_order_customer",
    customer: CUSTOMER,
    orders: [
      {
        orderDate: INVOICE_DATE,
        deliveryDate: INVOICE_DATE,
        orderLines: baseOrderLines,
      },
    ],
  }),
);

results.push(
  await run("two_call_product_lookup_then_inline_customer_name_org_with_product_vat_id", {
    invoiceDate: INVOICE_DATE,
    invoiceDueDate: INVOICE_DUE_DATE,
    comment: "variant two_call_product_lookup_then_inline_customer_name_org_with_product_vat_id",
    customer: CUSTOMER,
    orders: [
      {
        customer: CUSTOMER,
        orderDate: INVOICE_DATE,
        deliveryDate: INVOICE_DATE,
        orderLines: LINES.map((line) => ({
          product: { id: Number(productMap.get(line.ref)?.id) },
          description: line.name,
          count: 1,
          unitPriceExcludingVatCurrency: line.price,
          vatType: {
            id: Number((productMap.get(line.ref)?.vatType as Record<string, unknown>).id),
          },
        })),
      },
    ],
  }),
);

console.log(JSON.stringify({ existingCustomerId, results }, null, 2));
