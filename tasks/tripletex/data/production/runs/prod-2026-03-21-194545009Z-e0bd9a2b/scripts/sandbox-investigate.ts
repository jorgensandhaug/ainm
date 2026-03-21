const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string): Promise<any> {
  const url = `${BASE}${path}`;
  console.log(`GET ${url.substring(0, 120)}...`);
  const r = await fetch(url, { headers });
  const body = await r.json();
  console.log(`Status: ${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(body).substring(0, 500)); throw new Error(`GET failed ${r.status}`); }
  return body;
}

async function post(path: string, body: any): Promise<any> {
  const url = `${BASE}${path}`;
  console.log(`POST ${url}`);
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const respBody = await r.json();
  console.log(`Status: ${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(respBody).substring(0, 500)); throw new Error(`POST failed ${r.status}`); }
  return respBody;
}

async function main() {
  // Step 1: Check existing EUR invoices to understand the pattern
  const invRes = await get(`/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&fields=*,currency(*)`);
  const invoices = invRes.values || [];
  console.log(`\n=== All invoices (${invoices.length}) ===`);
  for (const inv of invoices) {
    console.log(`  ID=${inv.id}, currency=${inv.currency?.code}, amount=${inv.amount}, amountCurrency=${inv.amountCurrency}, amountExcludingVat=${inv.amountExcludingVat}, amountExcludingVatCurrency=${inv.amountExcludingVatCurrency}, amountOutstanding=${inv.amountOutstanding}, amountCurrencyOutstanding=${inv.amountCurrencyOutstanding}, amount===amountCurrency: ${inv.amount === inv.amountCurrency}`);
  }

  // Step 2: Now create a EUR invoice to test
  // First, find or create a customer
  const custRes = await get(`/customer?fields=*`);
  console.log(`\nCustomers: ${custRes.values?.length}`);
  for (const c of (custRes.values || []).slice(0, 5)) {
    console.log(`  Customer ${c.id}: ${c.name}, org=${c.organizationNumber}`);
  }

  // Step 3: Check if EUR currency exists
  const currRes = await get(`/currency?code=EUR&fields=*`);
  console.log(`\nEUR currency:`, JSON.stringify(currRes.values?.[0] || null).substring(0, 200));
}

main().catch(e => { console.error(e); process.exit(1); });
