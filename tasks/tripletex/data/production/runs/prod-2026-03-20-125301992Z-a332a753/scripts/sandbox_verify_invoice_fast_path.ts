const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const INVOICE_DATE = "2026-03-20";
const INVOICE_DUE_DATE = "2026-04-03";

const TEMP_CUSTOMER = {
  name: "Codex Reflection Rivière Fixture AS",
  organizationNumber: "999332753",
  invoiceSendMethod: "MANUAL",
};

const TEMP_PRODUCTS = [
  {
    name: "Codex Reflection Maintenance",
    number: "93327531",
    priceExcludingVatCurrency: 28100,
    vatPercentage: 25,
    description: "Maintenance",
  },
  {
    name: "Codex Reflection Web Design",
    number: "93327532",
    priceExcludingVatCurrency: 12600,
    vatPercentage: 15,
    description: "Design web",
  },
  {
    name: "Codex Reflection System Development",
    number: "93327533",
    priceExcludingVatCurrency: 1800,
    vatPercentage: 0,
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
  options: {
    query?: Array<[string, string]>;
    body?: any;
  } = {},
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of options.query ?? []) {
    url.searchParams.append(key, value);
  }

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

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function chooseVatType(vatTypes: any[], percentage: number): any {
  const matches = vatTypes.filter((vatType) => Number(vatType?.percentage ?? NaN) === percentage);
  if (matches.length === 0) {
    throw new Error(
      `No sandbox VAT type found for ${percentage}% in ${JSON.stringify(
        vatTypes.map((vatType) => ({
          id: vatType?.id ?? null,
          number: vatType?.number ?? null,
          percentage: vatType?.percentage ?? null,
          name: vatType?.name ?? null,
          displayName: vatType?.displayName ?? null,
        })),
      )}`,
    );
  }

  const sorted = matches.sort((a, b) => {
    const aKey = `${a?.number ?? ""}`.length;
    const bKey = `${b?.number ?? ""}`.length;
    return aKey - bKey || Number(a?.id ?? 0) - Number(b?.id ?? 0);
  });

  return sorted[0];
}

async function ensureCustomer() {
  const existing = values<any>(
    await api("GET", "/customer", {
      query: [
        ["organizationNumber", TEMP_CUSTOMER.organizationNumber],
        ["fields", "*"],
      ],
    }),
  );

  const found =
    existing.find(
      (customer) =>
        String(customer?.organizationNumber ?? "") === TEMP_CUSTOMER.organizationNumber &&
        normalize(customer?.name) === normalize(TEMP_CUSTOMER.name),
    ) ?? existing[0];

  if (found) return found;

  return value<any>(
    await api("POST", "/customer", {
      body: TEMP_CUSTOMER,
    }),
  );
}

async function ensureProducts() {
  const vatTypes = values<any>(
    await api("GET", "/ledger/vatType", {
      query: [
        ["typeOfVat", "OUTGOING"],
        ["vatDate", INVOICE_DATE],
        ["fields", "*"],
      ],
    }),
  );

  const existing = values<any>(
    await api("GET", "/product", {
      query: [
        ...TEMP_PRODUCTS.map((product) => ["productNumber", product.number] as [string, string]),
        ["fields", "*"],
      ],
    }),
  );

  const byNumber = new Map(existing.map((product) => [String(product?.number ?? ""), product]));
  const ensured: any[] = [];

  for (const spec of TEMP_PRODUCTS) {
    const current = byNumber.get(spec.number);
    if (current) {
      ensured.push(current);
      continue;
    }

    const vatType = chooseVatType(vatTypes, spec.vatPercentage);
    const created = value<any>(
      await api("POST", "/product", {
        body: {
          name: spec.name,
          number: spec.number,
          priceExcludingVatCurrency: spec.priceExcludingVatCurrency,
          vatType: { id: vatType.id },
        },
      }),
    );
    ensured.push(created);
  }

  return ensured;
}

function flattenInvoiceLines(invoice: any): any[] {
  if (Array.isArray(invoice?.orderLines) && invoice.orderLines.length > 0) return invoice.orderLines;
  if (Array.isArray(invoice?.orders?.[0]?.orderLines) && invoice.orders[0].orderLines.length > 0) {
    return invoice.orders[0].orderLines;
  }
  return [];
}

async function main() {
  const customer = await ensureCustomer();
  const products = await ensureProducts();

  const customerLookup = values<any>(
    await api("GET", "/customer", {
      query: [
        ["organizationNumber", TEMP_CUSTOMER.organizationNumber],
        ["fields", "*"],
      ],
    }),
  );
  const productLookup = values<any>(
    await api("GET", "/product", {
      query: [
        ...TEMP_PRODUCTS.map((product) => ["productNumber", product.number] as [string, string]),
        ["fields", "*"],
      ],
    }),
  );

  const customerId = customerLookup[0]?.id ?? customer.id;
  const productByNumber = new Map(
    productLookup.map((product) => [String(product?.number ?? ""), product]),
  );

  const invoiceCreate = value<any>(
    await api("POST", "/invoice", {
      query: [["sendToCustomer", "false"]],
      body: {
        invoiceDate: INVOICE_DATE,
        invoiceDueDate: INVOICE_DUE_DATE,
        customer: { id: customerId },
        orders: [
          {
            customer: { id: customerId },
            orderDate: INVOICE_DATE,
            deliveryDate: INVOICE_DATE,
            orderLines: TEMP_PRODUCTS.map((spec) => ({
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

  const postLines = flattenInvoiceLines(invoiceCreate);
  const invoiceVerified = value<any>(
    await api("GET", `/invoice/${invoiceCreate.id}`, {
      query: [
        [
          "fields",
          "*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))",
        ],
      ],
    }),
  );
  const verifiedLines = flattenInvoiceLines(invoiceVerified);

  console.log(
    JSON.stringify(
      {
        setup: {
          customerId,
          productNumbers: productLookup.map((product) => product?.number),
          productVatPercentages: productLookup.map((product) => ({
            number: product?.number,
            vatPercentage: product?.vatType?.percentage ?? null,
          })),
        },
        createInvoiceResponse: {
          invoiceId: invoiceCreate?.id ?? null,
          invoiceNumber: invoiceCreate?.invoiceNumber ?? null,
          amountExcludingVatCurrency: invoiceCreate?.amountExcludingVatCurrency ?? null,
          amountCurrency: invoiceCreate?.amountCurrency ?? null,
          topLevelLineCount: postLines.length,
          topLevelLineKeys: postLines[0] ? Object.keys(postLines[0]).sort() : [],
          ordersLineCount:
            Array.isArray(invoiceCreate?.orders?.[0]?.orderLines)
              ? invoiceCreate.orders[0].orderLines.length
              : 0,
        },
        verifiedInvoice: {
          invoiceId: invoiceVerified?.id ?? null,
          invoiceNumber: invoiceVerified?.invoiceNumber ?? null,
          amountExcludingVatCurrency: invoiceVerified?.amountExcludingVatCurrency ?? null,
          amountCurrency: invoiceVerified?.amountCurrency ?? null,
          lineCount: verifiedLines.length,
          lines: verifiedLines.map((line) => ({
            productNumber: line?.product?.number ?? null,
            productName: line?.product?.name ?? null,
            description: line?.description ?? null,
            unitPriceExcludingVatCurrency: line?.unitPriceExcludingVatCurrency ?? null,
            amountExcludingVatCurrency: line?.amountExcludingVatCurrency ?? null,
            vatPercentage: line?.vatType?.percentage ?? null,
            vatNumber: line?.vatType?.number ?? null,
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
