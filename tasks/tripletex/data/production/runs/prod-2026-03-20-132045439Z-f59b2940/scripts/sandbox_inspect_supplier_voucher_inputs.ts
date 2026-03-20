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

const uniq = Date.now().toString().slice(-6);
const supplier = await request<{ value: any }>("POST", "/supplier", {
  body: {
    name: `Codex Sandbox Supplier ${uniq} AS`,
    organizationNumber: `999${uniq}`,
  },
});

const [expenseAccount, vendorAccounts, vatIncoming, vatIncomingInvoice] = await Promise.all([
  request<{ values?: any[] }>("GET", "/ledger/account", {
    query: { number: 7000, fields: "*" },
  }),
  request<{ values?: any[] }>("GET", "/ledger/account", {
    query: { ledgerType: "VENDOR", fields: "*" },
  }),
  request<{ values?: any[] }>("GET", "/ledger/vatType", {
    query: { typeOfVat: "INCOMING", vatDate: "2026-03-20", fields: "*" },
  }),
  request<{ values?: any[] }>("GET", "/ledger/vatType", {
    query: { typeOfVat: "INCOMING_INVOICE", vatDate: "2026-03-20", fields: "*" },
  }),
]);

console.log(
  JSON.stringify(
    {
      supplier: supplier.value,
      expenseAccount: expenseAccount.values,
      vendorAccounts: vendorAccounts.values,
      vatIncoming: vatIncoming.values,
      vatIncomingInvoice: vatIncomingInvoice.values,
    },
    null,
    2,
  ),
);
