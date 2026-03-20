const BASE_URL = process.env.TRIPLETEX_BASE_URL;
const TOKEN = process.env.TRIPLETEX_SESSION_TOKEN;

if (!BASE_URL || !TOKEN) {
  throw new Error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_SESSION_TOKEN");
}

const RUN_DATE = "2026-03-20";
const CUSTOMER_ORG = "864062245";
const LINES = [
  { name: "Sandbox order verification line A", ref: "6749", price: 5100 },
  { name: "Sandbox order verification line B", ref: "3048", price: 7550 },
] as const;

type ApiList<T> = { values?: T[] };
type ApiValue<T> = { value?: T };

type Customer = { id: number; organizationNumber?: string | number };
type Product = { id: number; number?: string | number; productNumber?: string | number };
type PaymentType = {
  id: number;
  name?: string;
  debitAccount?: { number?: string | number; isBankAccount?: boolean; isInvoiceAccount?: boolean } | null;
};
type Invoice = {
  id: number;
  invoiceNumber?: string | number;
  amountCurrencyOutstanding?: number | null;
  amountOutstanding?: number | null;
};

const calls: Array<{ n: number; method: string; path: string; status: number }> = [];

function basicAuth(username: string, password: string) {
  return Buffer.from(`${username}:${password}`).toString("base64");
}

async function api<T>(method: string, path: string, opts?: { query?: Record<string, string | number | boolean | Array<string | number>>; body?: unknown; expected?: number[] }) {
  const url = new URL(path.replace(/^\//, ""), BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`);
  if (opts?.query) {
    for (const [key, raw] of Object.entries(opts.query)) {
      if (Array.isArray(raw)) {
        for (const value of raw) url.searchParams.append(key, String(value));
      } else {
        url.searchParams.set(key, String(raw));
      }
    }
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${basicAuth("0", TOKEN)}`,
      Accept: "application/json",
      ...(opts?.body === undefined ? {} : { "Content-Type": "application/json; charset=utf-8" }),
    },
    body: opts?.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  calls.push({ n: calls.length + 1, method, path: `${url.pathname}${url.search}`, status: res.status });

  const text = await res.text();
  const contentType = res.headers.get("content-type") || "";
  const parsed = text ? (contentType.includes("json") ? JSON.parse(text) : text) : undefined;
  const expected = opts?.expected ?? [200];
  if (!expected.includes(res.status)) {
    throw new Error(`HTTP ${res.status} ${method} ${url.pathname}${url.search}: ${text}`);
  }
  return parsed as T;
}

function normalize(value: unknown) {
  return String(value ?? "").trim();
}

function exactOne<T>(values: T[], label: string) {
  if (values.length !== 1) throw new Error(`Expected one ${label}, got ${values.length}`);
  return values[0]!;
}

function pickPaymentType(values: PaymentType[]) {
  return exactOne(
    values
      .filter((value) => normalize(value.debitAccount?.number).startsWith("19"))
      .sort((a, b) => {
        const aScore = (a.debitAccount?.isBankAccount ? 10 : 0) + (a.debitAccount?.isInvoiceAccount ? 5 : 0);
        const bScore = (b.debitAccount?.isBankAccount ? 10 : 0) + (b.debitAccount?.isInvoiceAccount ? 5 : 0);
        return bScore - aScore || a.id - b.id;
      })
      .slice(0, 1),
    "payment type",
  );
}

async function main() {
  const customerResp = await api<ApiList<Customer>>("GET", "/customer", {
    query: { organizationNumber: CUSTOMER_ORG, fields: "*" },
  });
  const customer = exactOne(
    (customerResp.values ?? []).filter((value) => normalize(value.organizationNumber) === CUSTOMER_ORG),
    "customer",
  );

  const productsResp = await api<ApiList<Product>>("GET", "/product", {
    query: { productNumber: LINES.map((line) => line.ref), fields: "*" },
  });
  const products = new Map(
    (productsResp.values ?? []).map((value) => [normalize(value.productNumber || value.number), value] as const),
  );
  for (const line of LINES) {
    if (!products.has(line.ref)) throw new Error(`Missing product ${line.ref}`);
  }

  const orderResp = await api<ApiValue<{ id: number }>>("POST", "/order", {
    body: {
      customer: { id: customer.id },
      orderDate: RUN_DATE,
      deliveryDate: RUN_DATE,
      orderLines: LINES.map((line) => ({
        product: { id: products.get(line.ref)!.id },
        description: line.name,
        count: 1,
        unitPriceExcludingVatCurrency: line.price,
      })),
    },
    expected: [200, 201],
  });
  const orderId = orderResp.value?.id;
  if (!orderId) throw new Error("Missing order id");

  const invoiceResp = await api<ApiValue<Invoice>>("PUT", `/order/${orderId}/:invoice`, {
    query: { invoiceDate: RUN_DATE, sendToCustomer: false },
    expected: [200],
  });
  const invoice = invoiceResp.value;
  if (!invoice?.id) throw new Error("Missing invoice id");
  const outstanding = invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding;
  if (outstanding == null) throw new Error("Missing outstanding amount");

  const paymentTypesResp = await api<ApiList<PaymentType>>("GET", "/invoice/paymentType", {
    query: { count: 1000, fields: "*,debitAccount(*),creditAccount(*)" },
  });
  const paymentType = pickPaymentType(paymentTypesResp.values ?? []);

  const paymentResp = await api<ApiValue<Invoice>>("PUT", `/invoice/${invoice.id}/:payment`, {
    query: {
      paymentDate: RUN_DATE,
      paymentTypeId: paymentType.id,
      paidAmount: outstanding,
    },
    expected: [200],
  });
  const paid = paymentResp.value;
  const remaining = paid?.amountCurrencyOutstanding ?? paid?.amountOutstanding;
  if (remaining !== 0) throw new Error(`Expected fully paid invoice, remaining ${remaining}`);

  console.log(
    JSON.stringify(
      {
        callCount: calls.length,
        calls,
        orderId,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        paymentTypeId: paymentType.id,
        remaining,
      },
      null,
      2,
    ),
  );
}

await main();
