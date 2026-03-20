const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH_HEADER = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
const DATE = "2026-03-20";
const DUE_DATE = "2026-04-03";
const VERIFY_FIELDS =
  "*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))";

const CUSTOMER_ORG = "999982629";
const LINES = [
  { productNumber: "67982629", description: "Webdesign", price: 27000, vatPercentage: 0 },
  { productNumber: "25982629", description: "Programvarelisens", price: 9300, vatPercentage: 0 },
  { productNumber: "37982629", description: "Opplæring", price: 16300, vatPercentage: 0 },
];

let apiCalls = 0;

type ApiResponse<T> = {
  value?: T;
  values?: T[];
};

type Customer = { id: number; organizationNumber?: string };
type Product = { id: number; number?: string | number; vatType?: { percentage?: number } | null };
type InvoiceLine = {
  id?: number;
  description?: string;
  count?: number;
  unitPriceExcludingVatCurrency?: number;
  product?: { number?: string | number } | null;
  vatType?: { percentage?: number } | null;
};
type Invoice = {
  id: number;
  invoiceNumber?: number;
  amountExcludingVat?: number;
  amount?: number;
  orderLines?: InvoiceLine[];
  orders?: { orderLines?: InvoiceLine[] }[];
};

function norm(value: unknown): string {
  return String(value ?? "").trim();
}

async function request<T>(
  path: string,
  options: {
    method?: string;
    query?: URLSearchParams | Record<string, string | number | boolean>;
    body?: unknown;
    expectedStatus?: number | number[];
  } = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const url = new URL(`${BASE_URL}${path}`);
  if (options.query instanceof URLSearchParams) {
    url.search = options.query.toString();
  } else if (options.query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options.query)) {
      params.append(key, String(value));
    }
    url.search = params.toString();
  }

  const headers: Record<string, string> = {
    Authorization: AUTH_HEADER,
    Accept: "application/json",
  };
  let body: string | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json; charset=utf-8";
    body = JSON.stringify(options.body);
  }

  apiCalls += 1;
  const response = await fetch(url, { method, headers, body });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  const expected = Array.isArray(options.expectedStatus)
    ? options.expectedStatus
    : options.expectedStatus !== undefined
      ? [options.expectedStatus]
      : [200];
  if (!expected.includes(response.status)) {
    console.error(JSON.stringify({ path: `${url.pathname}${url.search}`, status: response.status, data }, null, 2));
    process.exit(1);
  }
  return data as T;
}

function getValues<T>(response: ApiResponse<T>): T[] {
  return Array.isArray(response.values) ? response.values : [];
}

function getInvoiceLines(invoice: Invoice): InvoiceLine[] {
  if (Array.isArray(invoice.orderLines) && invoice.orderLines.length > 0) {
    return invoice.orderLines;
  }
  return (invoice.orders ?? []).flatMap((order) => order.orderLines ?? []);
}

const customerResponse = await request<ApiResponse<Customer>>("/customer", {
  query: {
    organizationNumber: CUSTOMER_ORG,
    fields: "*",
  },
  expectedStatus: 200,
});
const customer = getValues(customerResponse).find(
  (candidate) => norm(candidate.organizationNumber) === CUSTOMER_ORG,
);
if (!customer) {
  throw new Error("Existing sandbox customer not found");
}

const productQuery = new URLSearchParams();
for (const line of LINES) {
  productQuery.append("productNumber", line.productNumber);
}
productQuery.append("fields", "*");

const productResponse = await request<ApiResponse<Product>>("/product", {
  query: productQuery,
  expectedStatus: 200,
});
const productsByNumber = new Map<string, Product>();
for (const product of getValues(productResponse)) {
  productsByNumber.set(norm(product.number), product);
}
for (const line of LINES) {
  const product = productsByNumber.get(line.productNumber);
  if (!product) {
    throw new Error(`Missing product ${line.productNumber}`);
  }
}

const invoiceWrite = await request<ApiResponse<Invoice>>("/invoice", {
  method: "POST",
  query: {
    sendToCustomer: false,
  },
  body: {
    invoiceDate: DATE,
    invoiceDueDate: DUE_DATE,
    customer: { id: customer.id },
    orders: [
      {
        customer: { id: customer.id },
        orderDate: DATE,
        deliveryDate: DATE,
        orderLines: LINES.map((line) => ({
          product: { id: productsByNumber.get(line.productNumber)!.id },
          description: line.description,
          count: 1,
          unitPriceExcludingVatCurrency: line.price,
        })),
      },
    ],
  },
  expectedStatus: 201,
});

if (!invoiceWrite.value) {
  throw new Error("Invoice write missing value");
}

const invoiceRead = await request<ApiResponse<Invoice>>(`/invoice/${invoiceWrite.value.id}`, {
  query: {
    fields: VERIFY_FIELDS,
  },
  expectedStatus: 200,
});
if (!invoiceRead.value) {
  throw new Error("Invoice read missing value");
}

console.log(
  JSON.stringify(
    {
      apiCalls,
      resolvedProducts: getValues(productResponse).map((product) => ({
        id: product.id,
        number: product.number,
        vatType: product.vatType,
      })),
      invoiceWrite: {
        id: invoiceWrite.value.id,
        invoiceNumber: invoiceWrite.value.invoiceNumber,
        orderLinesLength: invoiceWrite.value.orderLines?.length ?? 0,
        sparseOrderLines: (invoiceWrite.value.orderLines ?? []).every(
          (line) => !!line.id && !line.description && !line.product,
        ),
      },
      verifiedLines: getInvoiceLines(invoiceRead.value).map((line) => ({
        productNumber: line.product?.number,
        description: line.description,
        count: line.count,
        unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
        vatPercentage: line.vatType?.percentage,
      })),
    },
    null,
    2,
  ),
);
