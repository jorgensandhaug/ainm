// Sandbox investigation: check existing state, verify voucher approach for non-invoice lines
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`${method} /${path} → ${r.status}`);
  if (!r.ok) { console.error(`  Body: ${text.slice(0, 500)}`); }
  return { status: r.status, data: r.ok ? JSON.parse(text) : null, raw: text };
}

// Check what invoices, suppliers, and accounts exist in sandbox
const [inv, sup, si, acc] = await Promise.all([
  api("GET", "invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,customer(*)"),
  api("GET", "supplier?count=1000&fields=*"),
  api("GET", "supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,supplier(*)"),
  api("GET", "ledger/account?number=1920,2400,2600,7770,8050,8150&fields=*"),
]);

console.log("\n=== INVOICES ===");
for (const i of inv.data?.values || []) {
  console.log(`  ${i.id}: ${i.customer?.name} inv#${i.invoiceNumber} outstanding=${i.amountCurrencyOutstanding ?? i.amountOutstanding} total=${i.amount}`);
}

console.log("\n=== SUPPLIERS ===");
for (const s of sup.data?.values || []) {
  console.log(`  ${s.id}: ${s.name}`);
}

console.log("\n=== SUPPLIER INVOICES ===");
for (const si2 of si.data?.values || []) {
  console.log(`  ${si2.id}: ${si2.supplier?.name} amount=${si2.amount}`);
}

console.log("\n=== ACCOUNTS ===");
for (const a of acc.data?.values || []) {
  console.log(`  ${a.id}: ${a.number} ${a.name}`);
}

// Also check if 8150 exists (for interest expense vs income)
const acc2 = await api("GET", "ledger/account?number=8150&fields=*");
console.log("\n=== ACCOUNT 8150 ===");
for (const a of acc2.data?.values || []) {
  console.log(`  ${a.id}: ${a.number} ${a.name}`);
}
