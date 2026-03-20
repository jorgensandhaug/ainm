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
    (err as Error & { status?: number; body?: unknown }).body = body ?? text;
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

async function ensureSetup() {
  const vatPayload = await api("ledger/vatType", {
    query: { typeOfVat: "OUTGOING", vatDate: INVOICE_DATE, fields: "*" },
  });
  const vatZero = valuesOf<Record<string, unknown>>(vatPayload).find(
    (vatType) => Number(vatType.percentage) === 0,
  );
  if (!vatZero) throw new Error("Missing outgoing 0% VAT in sandbox");

  const customerSearch = await api("customer", {
    query: { organizationNumber: CUSTOMER.organizationNumber, fields: "*" },
  });
  let customer = valuesOf<Record<string, unknown>>(customerSearch)[0];
  if (!customer) {
    customer = valueOf<Record<string, unknown>>(
      await api("customer", { method: "POST", body: CUSTOMER }),
    );
  }

  const productSearch = await api("product", {
    query: { productNumber: LINES.map((line) => line.ref), fields: "*" },
  });
  const existing = new Map(
    valuesOf<Record<string, unknown>>(productSearch).map((product) => [productRefOf(product), product]),
  );
  for (const line of LINES) {
    if (existing.has(line.ref)) continue;
    const created = valueOf<Record<string, unknown>>(
      await api("product", {
        method: "POST",
        body: {
          name: line.name,
          number: line.ref,
          priceExcludingVatCurrency: line.price,
          vatType: { id: Number(vatZero.id) },
        },
      }),
    );
    existing.set(line.ref, created);
  }

  return {
    customer,
    products: existing,
    vatZero,
  };
}

type VariantResult = {
  name: string;
  status: "success" | "error";
  calls: string[];
  invoiceId?: number;
  invoiceNumber?: number;
  amountExcludingVatCurrency?: number;
  amountCurrency?: number;
  customerId?: number;
  lineProducts?: Array<string | null>;
  lineVatPercentages?: Array<number | null>;
  error?: unknown;
};

async function runVariant(
  name: string,
  run: () => Promise<{
    invoice: Record<string, unknown>;
    calls: string[];
  }>,
) {
  try {
    const { invoice, calls } = await run();
    const invoiceId = Number(invoice.id);
    const detail = valueOf<Record<string, unknown>>(
      await api(`invoice/${invoiceId}`, {
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
      status: "success" as const,
      calls,
      invoiceId,
      invoiceNumber: Number(invoice.invoiceNumber),
      amountExcludingVatCurrency: Number(invoice.amountExcludingVatCurrency),
      amountCurrency: Number(invoice.amountCurrency),
      customerId: Number((detail.customer as Record<string, unknown> | undefined)?.id ?? 0),
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
      status: "error" as const,
      calls: [],
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

function invoiceBody(args: {
  customer: Record<string, unknown>;
  orderCustomer?: Record<string, unknown>;
  products?: Map<string, Record<string, unknown>>;
  productMode: "id" | "number" | "productNumber";
  explicitVatFromProduct?: boolean;
  comment: string;
}) {
  const orderLines = LINES.map((line) => {
    const product = args.products?.get(line.ref);
    const productRef =
      args.productMode === "id"
        ? { id: Number(product?.id) }
        : args.productMode === "number"
          ? { number: line.ref }
          : { productNumber: line.ref };

    return {
      product: productRef,
      description: line.name,
      count: 1,
      unitPriceExcludingVatCurrency: line.price,
      ...(args.explicitVatFromProduct && product?.vatType
        ? {
            vatType: {
              id: Number((product.vatType as Record<string, unknown>).id),
            },
          }
        : {}),
    };
  });

  return {
    invoiceDate: INVOICE_DATE,
    invoiceDueDate: INVOICE_DUE_DATE,
    comment: args.comment,
    customer: args.customer,
    orders: [
      {
        ...(args.orderCustomer ? { customer: args.orderCustomer } : {}),
        orderDate: INVOICE_DATE,
        deliveryDate: INVOICE_DATE,
        orderLines,
      },
    ],
  };
}

const setup = await ensureSetup();
const customerId = Number(setup.customer.id);

const customerGetPayload = await api("customer", {
  query: { organizationNumber: CUSTOMER.organizationNumber, fields: "*" },
});
const productGetPayload = await api("product", {
  query: { productNumber: LINES.map((line) => line.ref), fields: "*" },
});
const resolvedCustomer = valuesOf<Record<string, unknown>>(customerGetPayload)[0];
const resolvedProducts = new Map(
  valuesOf<Record<string, unknown>>(productGetPayload).map((product) => [productRefOf(product), product]),
);

const results: VariantResult[] = [];

results.push(
  await runVariant("one_call_customer_org_product_number", async () => {
    const payload = await api("invoice", {
      method: "POST",
      query: { sendToCustomer: "false" },
      body: invoiceBody({
        customer: { organizationNumber: CUSTOMER.organizationNumber },
        orderCustomer: { organizationNumber: CUSTOMER.organizationNumber },
        productMode: "number",
        comment: "variant one_call_customer_org_product_number",
      }),
    });
    return {
      invoice: valueOf<Record<string, unknown>>(payload),
      calls: ["POST /invoice?sendToCustomer=false (customer.organizationNumber + product.number)"],
    };
  }),
);

results.push(
  await runVariant("one_call_customer_org_product_productNumber", async () => {
    const payload = await api("invoice", {
      method: "POST",
      query: { sendToCustomer: "false" },
      body: invoiceBody({
        customer: { organizationNumber: CUSTOMER.organizationNumber },
        orderCustomer: { organizationNumber: CUSTOMER.organizationNumber },
        productMode: "productNumber",
        comment: "variant one_call_customer_org_product_productNumber",
      }),
    });
    return {
      invoice: valueOf<Record<string, unknown>>(payload),
      calls: ["POST /invoice?sendToCustomer=false (customer.organizationNumber + product.productNumber)"],
    };
  }),
);

results.push(
  await runVariant("two_call_get_customer_then_product_number", async () => {
    const payload = await api("invoice", {
      method: "POST",
      query: { sendToCustomer: "false" },
      body: invoiceBody({
        customer: { id: customerId },
        orderCustomer: { id: customerId },
        productMode: "number",
        comment: "variant two_call_get_customer_then_product_number",
      }),
    });
    return {
      invoice: valueOf<Record<string, unknown>>(payload),
      calls: [
        "GET /customer?organizationNumber=861379760&fields=*",
        "POST /invoice?sendToCustomer=false (product.number)",
      ],
    };
  }),
);

results.push(
  await runVariant("two_call_get_customer_then_product_productNumber", async () => {
    const payload = await api("invoice", {
      method: "POST",
      query: { sendToCustomer: "false" },
      body: invoiceBody({
        customer: { id: customerId },
        orderCustomer: { id: customerId },
        productMode: "productNumber",
        comment: "variant two_call_get_customer_then_product_productNumber",
      }),
    });
    return {
      invoice: valueOf<Record<string, unknown>>(payload),
      calls: [
        "GET /customer?organizationNumber=861379760&fields=*",
        "POST /invoice?sendToCustomer=false (product.productNumber)",
      ],
    };
  }),
);

results.push(
  await runVariant("two_call_get_product_then_customer_org", async () => {
    const payload = await api("invoice", {
      method: "POST",
      query: { sendToCustomer: "false" },
      body: invoiceBody({
        customer: { organizationNumber: CUSTOMER.organizationNumber },
        orderCustomer: { organizationNumber: CUSTOMER.organizationNumber },
        products: resolvedProducts,
        productMode: "id",
        comment: "variant two_call_get_product_then_customer_org",
      }),
    });
    return {
      invoice: valueOf<Record<string, unknown>>(payload),
      calls: [
        "GET /product?productNumber=2109&productNumber=1175&productNumber=9974&fields=*",
        "POST /invoice?sendToCustomer=false (customer.organizationNumber + product.id)",
      ],
    };
  }),
);

results.push(
  await runVariant("three_call_customer_product_post_inherit_vat", async () => {
    const payload = await api("invoice", {
      method: "POST",
      query: { sendToCustomer: "false" },
      body: invoiceBody({
        customer: { id: customerId },
        orderCustomer: { id: customerId },
        products: resolvedProducts,
        productMode: "id",
        comment: "variant three_call_customer_product_post_inherit_vat",
      }),
    });
    return {
      invoice: valueOf<Record<string, unknown>>(payload),
      calls: [
        "GET /customer?organizationNumber=861379760&fields=*",
        "GET /product?productNumber=2109&productNumber=1175&productNumber=9974&fields=*",
        "POST /invoice?sendToCustomer=false (product.id, no explicit vatType)",
      ],
    };
  }),
);

results.push(
  await runVariant("three_call_customer_product_post_product_vat_id", async () => {
    const payload = await api("invoice", {
      method: "POST",
      query: { sendToCustomer: "false" },
      body: invoiceBody({
        customer: { id: customerId },
        orderCustomer: { id: customerId },
        products: resolvedProducts,
        productMode: "id",
        explicitVatFromProduct: true,
        comment: "variant three_call_customer_product_post_product_vat_id",
      }),
    });
    return {
      invoice: valueOf<Record<string, unknown>>(payload),
      calls: [
        "GET /customer?organizationNumber=861379760&fields=*",
        "GET /product?productNumber=2109&productNumber=1175&productNumber=9974&fields=*",
        "POST /invoice?sendToCustomer=false (product.id + product.vatType.id)",
      ],
    };
  }),
);

results.push({
  name: "probe_setup_reads",
  status: "success",
  calls: [
    "GET /customer?organizationNumber=861379760&fields=*",
    "GET /product?productNumber=2109&productNumber=1175&productNumber=9974&fields=*",
  ],
  customerId: Number(resolvedCustomer.id),
});

console.log(JSON.stringify({ results }, null, 2));
