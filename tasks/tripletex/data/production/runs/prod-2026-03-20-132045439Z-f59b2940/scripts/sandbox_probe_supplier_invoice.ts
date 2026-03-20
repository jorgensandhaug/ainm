const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

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

const invoices = await request<{ values?: any[] }>("GET", "/supplierInvoice", {
  query: {
    invoiceDateFrom: "2025-01-01",
    invoiceDateTo: "2027-12-31",
    count: 10,
    sorting: "-invoiceDate",
    fields: "*",
  },
});

if (!invoices.values?.length) {
  console.log(JSON.stringify({ found: 0 }, null, 2));
  process.exit(0);
}

const invoice = invoices.values[0];
const voucherId = invoice?.voucher?.id;

const voucher = voucherId
  ? await request<{ value: any }>("GET", `/ledger/voucher/${voucherId}`, {
      query: {
        fields: "*,postings(*,account(*),vatType(*),supplier(*),currency(*))",
      },
    })
  : null;

console.log(
  JSON.stringify(
    {
      invoice,
      voucher: voucher?.value ?? null,
    },
    null,
    2,
  ),
);
