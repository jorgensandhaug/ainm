// Verify: correct fields for /supplierInvoice broad query
// And test if openPost could replace /supplier + /supplierInvoice reads
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
  if (!r.ok) { console.log("  ERROR:", JSON.stringify(json).slice(0, 300)); return null; }
  if (json?.values !== undefined) return json.values;
  if (json?.value !== undefined) return json.value;
  return json;
}

// Test 1: Broad /supplierInvoice with fields=*,supplier(*)
const si = await api("GET", "/supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,supplier(*)");
console.log(`\nBroad supplierInvoice (fields=*,supplier(*)): ${si?.length ?? 0} results`);
if (si && si.length > 0) {
  si.slice(0, 3).forEach((s: any) => console.log(`  SI id=${s.id} supplier=${s.supplier?.name} outstanding=${s.amountOutstanding}`));
}

// Test 2: openPost with account expansion to get account IDs
const op = await api("GET", "/ledger/posting/openPost?date=2031-01-01&accountNumberFrom=2400&accountNumberTo=2400&count=1000&fields=*,account(id,number),supplier(id,name)");
console.log(`\nOpen postings on 2400 with account expansion: ${op?.length ?? 0}`);
if (op && op.length > 0) {
  op.slice(0, 3).forEach((p: any) => console.log(`  posting id=${p.id} amount=${p.amount} account={id:${p.account?.id},num:${p.account?.number}} supplier=${p.supplier?.name}(${p.supplier?.id})`));
}

// Test 3: Can we get 1920 account ID from ledger/account with a narrow query?
const accts = await api("GET", "/ledger/account?number=1920&count=1&fields=id,number");
console.log(`\nAccount 1920: ${JSON.stringify(accts)}`);

console.log("\n--- Analysis ---");
console.log("If openPost on 2400 gives supplier IDs + names, we could skip /supplier read");
console.log("But we still need /supplierInvoice to decide addPayment vs manual voucher path");
console.log("Net saving: at best 1 call (/supplier) if we use openPost for supplier resolution");
