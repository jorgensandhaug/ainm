const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const DATE = "2026-03-20";
const AMOUNT_GROSS = 62850;
const AMOUNT_NET = 50280;
const AMOUNT_VAT = 12570;

function authHeader() {
  return `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
}

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(`${BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function request<T>(
  method: string,
  path: string,
  opts?: { query?: Record<string, string | number | boolean | undefined>; body?: unknown },
): Promise<T> {
  const response = await fetch(buildUrl(path, opts?.query), {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(opts?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${response.status} ${response.statusText}\n${text}`);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

const uniq = Date.now().toString().slice(-6);

const supplier = await request<{ value: any }>("POST", "/supplier", {
  body: {
    name: `Codex Voucher Supplier ${uniq} AS`,
    organizationNumber: `998${uniq}`,
  },
});

const voucher = await request<{ value: any }>("POST", "/ledger/voucher", {
  body: {
    date: DATE,
    description: "kontortenester",
    voucherType: { id: 9744845 },
    vendorInvoiceNumber: `INV-CODEX-${uniq}`,
    postings: [
      {
        row: 1,
        date: DATE,
        description: "kontortenester",
        account: { id: 424191158 },
        vatType: { id: 1 },
        currency: { id: 1 },
        amount: AMOUNT_NET,
        amountCurrency: AMOUNT_NET,
        amountGross: AMOUNT_GROSS,
        amountGrossCurrency: AMOUNT_GROSS,
      },
      {
        row: 2,
        date: DATE,
        description: "kontortenester",
        account: { id: 424190921 },
        supplier: { id: supplier.value.id },
        currency: { id: 1 },
        amount: -AMOUNT_GROSS,
        amountCurrency: -AMOUNT_GROSS,
        amountGross: -AMOUNT_GROSS,
        amountGrossCurrency: -AMOUNT_GROSS,
        invoiceNumber: `INV-CODEX-${uniq}`,
        termOfPayment: DATE,
      },
    ],
  },
});

const supplierInvoices = await request<{ values?: any[] }>("GET", "/supplierInvoice", {
  query: {
    invoiceDateFrom: "2026-03-01",
    invoiceDateTo: "2026-04-01",
    supplierId: supplier.value.id,
    fields: "*",
  },
});

console.log(
  JSON.stringify(
    {
      supplier: supplier.value,
      voucher: voucher.value,
      supplierInvoices: supplierInvoices.values ?? [],
    },
    null,
    2,
  ),
);
