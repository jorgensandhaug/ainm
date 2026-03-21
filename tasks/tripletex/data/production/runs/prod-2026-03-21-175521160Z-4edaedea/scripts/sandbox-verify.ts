// Sandbox verification: check if broad /supplierInvoice query is reliable,
// and whether /ledger/posting/openPost could replace separate /supplier + /supplierInvoice reads
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method, headers });
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log("  ERROR:", JSON.stringify(json).slice(0, 200)); return null; }
  if (json?.values !== undefined) return json.values;
  if (json?.value !== undefined) return json.value;
  return json;
}

// Test 1: Does broad /supplierInvoice return results when they exist?
const siAll = await api("GET", "/supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=id,invoiceNumber,amount,amountCurrencyOutstanding,supplier(id,name)");
console.log(`\nBroad supplierInvoice count: ${siAll?.length ?? 0}`);
if (siAll && siAll.length > 0) {
  siAll.slice(0, 5).forEach((si: any) => console.log(`  SI#${si.invoiceNumber} supplier=${si.supplier?.name} outstanding=${si.amountCurrencyOutstanding}`));
}

// Test 2: Open postings on 2400 with supplier expansion
const openPosts = await api("GET", "/ledger/posting/openPost?date=2031-01-01&accountNumberFrom=2400&accountNumberTo=2400&count=1000&fields=*,supplier(id,name)");
console.log(`\nOpen postings on 2400: ${openPosts?.length ?? 0}`);
if (openPosts && openPosts.length > 0) {
  openPosts.slice(0, 5).forEach((p: any) => console.log(`  posting id=${p.id} amount=${p.amount} supplier=${p.supplier?.name || 'none'}`));
}

// Test 3: Can /supplier be replaced by the supplier expansion in /invoice?
const invoices = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=id,invoiceNumber,amountCurrencyOutstanding,customer(id,name)");
console.log(`\nInvoices: ${invoices?.length ?? 0}`);
if (invoices && invoices.length > 0) {
  invoices.slice(0, 5).forEach((inv: any) => console.log(`  inv#${inv.invoiceNumber} customer=${inv.customer?.name} outstanding=${inv.amountCurrencyOutstanding}`));
}

// Test 4: Check suppliers list
const suppliers = await api("GET", "/supplier?count=1000&fields=id,name");
console.log(`\nSuppliers: ${suppliers?.length ?? 0}`);
if (suppliers && suppliers.length > 0) {
  suppliers.forEach((s: any) => console.log(`  supplier id=${s.id} name=${s.name}`));
}

console.log("\n--- Summary ---");
console.log(`Broad supplierInvoice returns: ${siAll?.length ?? 0} results`);
console.log(`Open postings on 2400: ${openPosts?.length ?? 0}`);
console.log(`If broad SI returns results, we can match on supplier name + amount without per-supplier queries`);
