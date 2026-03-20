const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const INVOICE_DATE = "2026-03-20";
const INVOICE_DUE_DATE = "2026-04-03";

const CUSTOMER = {
  name: "Codex Reflection Invoice Link Fixture AS",
  organizationNumber: "999332754",
  invoiceSendMethod: "MANUAL",
};

const PRODUCTS = [
  {
    name: "Codex Reflection Link Product A",
    number: "93327541",
    priceExcludingVatCurrency: 28100,
    description: "Maintenance",
  },
  {
    name: "Codex Reflection Link Product B",
    number: "93327542",
    priceExcludingVatCurrency: 12600,
    description: "Design web",
  },
  {
    name: "Codex Reflection Link Product C",
    number: "93327543",
    priceExcludingVatCurrency: 1800,
    description: "Développement système",
  },
] as const;

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

class ApiError extends Error {
  status: number;
  body: any;

  constructor(status: number, body: any, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function api<T = any>(
  method: string,
  path: string,
  options: { query?: Array<[string, string]>; body?: any } = {},
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of options.query ?? []) url.searchParams.append(key, value);

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const body = text ? safeJsonParse(text) : null;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body,
      `${method} ${url.pathname}${url.search} failed with ${response.status}`,
    );
  }
  return body as T;
}

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function values<T>(payload: any): T[] {
  return Array.isArray(payload?.values) ? (payload.values as T[]) : [];
}

function value<T>(payload: any): T {
  return payload?.value as T;
}

function flattenInvoiceLines(invoice: any): any[] {
  if (Array.isArray(invoice?.orderLines) && invoice.orderLines.length > 0) return invoice.orderLines;
  if (Array.isArray(invoice?.orders?.[0]?.orderLines) && invoice.orders[0].orderLines.length > 0) {
    return invoice.orders[0].orderLines;
  }
  return [];
}

async function ensureCustomer() {
  const found = values<any>(
    await api("GET", "/customer", {
      query: [
        ["organizationNumber", CUSTOMER.organizationNumber],
        ["fields", "*"],
      ],
    }),
  )[0];

  if (found) return found;

  return value<any>(
    await api("POST", "/customer", {
      body: CUSTOMER,
    }),
  );
}

async function ensureProducts() {
  const outgoingVat = values<any>(
    await api("GET", "/ledger/vatType", {
      query: [
        ["typeOfVat", "OUTGOING"],
        ["vatDate", INVOICE_DATE],
        ["fields", "*"],
      ],
    }),
  );

  const zeroVat = outgoingVat.find((vatType) => Number(vatType?.percentage ?? NaN) === 0);
  if (!zeroVat?.id) {
    throw new Error(`Sandbox missing valid outgoing 0% VAT type: ${JSON.stringify(outgoingVat)}`);
  }

  const existing = values<any>(
    await api("GET", "/product", {
      query: [
        ...PRODUCTS.map((product) => ["productNumber", product.number] as [string, string]),
        ["fields", "*"],
      ],
    }),
  );
  const byNumber = new Map(existing.map((product) => [String(product?.number ?? ""), product]));

  const ensured: any[] = [];
  for (const spec of PRODUCTS) {
    const current = byNumber.get(spec.number);
    if (current) {
      ensured.push(current);
      continue;
    }

    ensured.push(
      value<any>(
        await api("POST", "/product", {
          body: {
            name: spec.name,
            number: spec.number,
            priceExcludingVatCurrency: spec.priceExcludingVatCurrency,
            vatType: { id: zeroVat.id },
          },
        }),
      ),
    );
  }

  return ensured;
}

async function main() {
  await ensureCustomer();
  await ensureProducts();

  const customer = values<any>(
    await api("GET", "/customer", {
      query: [
        ["organizationNumber", CUSTOMER.organizationNumber],
        ["fields", "*"],
      ],
    }),
  )[0];
  const products = values<any>(
    await api("GET", "/product", {
      query: [
        ...PRODUCTS.map((product) => ["productNumber", product.number] as [string, string]),
        ["fields", "*"],
      ],
    }),
  );

  const productByNumber = new Map(products.map((product) => [String(product?.number ?? ""), product]));
  const createdInvoice = value<any>(
    await api("POST", "/invoice", {
      query: [["sendToCustomer", "false"]],
      body: {
        invoiceDate: INVOICE_DATE,
        invoiceDueDate: INVOICE_DUE_DATE,
        customer: { id: customer.id },
        orders: [
          {
            customer: { id: customer.id },
            orderDate: INVOICE_DATE,
            deliveryDate: INVOICE_DATE,
            orderLines: PRODUCTS.map((spec) => ({
              product: { id: productByNumber.get(spec.number)?.id },
              description: spec.description,
              count: 1,
              unitPriceExcludingVatCurrency: spec.priceExcludingVatCurrency,
            })),
          },
        ],
      },
    }),
  );

  const postLines = flattenInvoiceLines(createdInvoice);
  const verifiedInvoice = value<any>(
    await api("GET", `/invoice/${createdInvoice.id}`, {
      query: [
        [
          "fields",
          "*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))",
        ],
      ],
    }),
  );
  const verifiedLines = flattenInvoiceLines(verifiedInvoice);

  console.log(
    JSON.stringify(
      {
        sandboxConstraint: {
          outgoingVatPercentages: products.map((product) => ({
            number: product?.number ?? null,
            vatPercentage: product?.vatType?.percentage ?? null,
          })),
        },
        fastPathCalls: [
          `GET /customer?organizationNumber=${CUSTOMER.organizationNumber}&fields=*`,
          `GET /product?productNumber=${PRODUCTS[0].number}&productNumber=${PRODUCTS[1].number}&productNumber=${PRODUCTS[2].number}&fields=*`,
          "POST /invoice?sendToCustomer=false",
          `GET /invoice/${createdInvoice.id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))`,
        ],
        createInvoiceResponse: {
          invoiceId: createdInvoice?.id ?? null,
          invoiceNumber: createdInvoice?.invoiceNumber ?? null,
          amountExcludingVatCurrency: createdInvoice?.amountExcludingVatCurrency ?? null,
          amountCurrency: createdInvoice?.amountCurrency ?? null,
          orderLinesCount: postLines.length,
          firstOrderLineKeys: postLines[0] ? Object.keys(postLines[0]).sort() : [],
        },
        verifiedInvoice: {
          invoiceId: verifiedInvoice?.id ?? null,
          invoiceNumber: verifiedInvoice?.invoiceNumber ?? null,
          amountExcludingVatCurrency: verifiedInvoice?.amountExcludingVatCurrency ?? null,
          amountCurrency: verifiedInvoice?.amountCurrency ?? null,
          lineCount: verifiedLines.length,
          lines: verifiedLines.map((line) => ({
            productNumber: line?.product?.number ?? null,
            description: line?.description ?? null,
            unitPriceExcludingVatCurrency: line?.unitPriceExcludingVatCurrency ?? null,
            amountExcludingVatCurrency: line?.amountExcludingVatCurrency ?? null,
            vatPercentage: line?.vatType?.percentage ?? null,
          })),
        },
      },
      null,
      2,
    ),
  );
}

await main().catch((error) => {
  const payload =
    error instanceof ApiError
      ? { error: error.message, status: error.status, body: error.body }
      : { error: error instanceof Error ? error.message : String(error) };
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
});
