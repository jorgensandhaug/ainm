const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

function authHeader() {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

function endpoint(path: string, params?: Record<string, string>) {
  const url = new URL(path, `${BASE_URL}/`);
  if (params) {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  }
  return url;
}

async function request(path: string, params?: Record<string, string>) {
  const response = await fetch(endpoint(path, params), {
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

function texts(invoice: any) {
  const out: string[] = [];
  for (const line of invoice.orderLines ?? []) {
    if (line.description) out.push(line.description);
    if (line.displayName) out.push(line.displayName);
  }
  for (const order of invoice.orders ?? []) {
    if (order.invoiceComment) out.push(order.invoiceComment);
    for (const line of order.orderLines ?? []) {
      if (line.description) out.push(line.description);
      if (line.displayName) out.push(line.displayName);
    }
  }
  return [...new Set(out)];
}

const data = await request("invoice", {
  invoiceDateFrom: "2020-01-01",
  invoiceDateTo: "2030-12-31",
  count: "1000",
  sorting: "-invoiceDate",
  fields: "*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))",
});

const candidates = (data.values ?? [])
  .map((invoice: any) => ({
    id: invoice.id,
    org: String(invoice.customer?.organizationNumber ?? ""),
    amountExVat: invoice.amountExcludingVatCurrency ?? invoice.amountExcludingVat ?? null,
    outstanding: invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding ?? null,
    texts: texts(invoice),
  }))
  .filter((invoice: any) => typeof invoice.outstanding === "number" && invoice.outstanding > 0)
  .slice(0, 30);

console.log(JSON.stringify(candidates, null, 2));
