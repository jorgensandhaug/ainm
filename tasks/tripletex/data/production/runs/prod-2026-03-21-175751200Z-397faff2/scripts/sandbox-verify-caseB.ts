// Sandbox verification: check that Case B math is correct for the production shape
// Original: 6540 gross=11450, net=9160, 2710=2290 (net booked as gross)
// Prompt: 11450 excl. VAT on 6540, missing VAT on 2710
// Expected correction: 2710 +572.50, 6540 +2290 (vatType=0), 2400 -2862.50

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    console.error(`${res.status} ${res.statusText}`, JSON.stringify(data, null, 2));
    return { error: true, status: res.status, data };
  }
  return data;
}

// 1. Check existing vouchers to understand sandbox state
const vRes = await api("GET", "/ledger/voucher?dateFrom=2026-01-01&dateTo=2026-03-01&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)&count=1000");

if (vRes.error) {
  console.log("Sandbox voucher fetch failed, checking auth...");
  process.exit(1);
}

console.log(`Sandbox has ${vRes.values?.length} vouchers in Jan-Feb 2026`);

// Show accounts with 6540 and 2710 to verify Case B detection
for (const v of vRes.values || []) {
  const has6540 = (v.postings || []).some((p: any) => p.account?.number === 6540);
  const has2710 = (v.postings || []).some((p: any) => p.account?.number === 2710);
  if (has6540) {
    console.log(`\nVoucher ${v.id} (${v.date}): ${v.description}`);
    for (const p of v.postings || []) {
      console.log(`  Acct ${p.account?.number}: gross=${p.amountGross}, net=${p.amount}, vatType=${p.vatType?.id}, supplier=${p.supplier?.id}`);
    }
    console.log(`  has2710: ${has2710}`);
  }
}

// Verify Case B math for the production run shape
console.log("\n=== Case B math verification ===");
const netAmount = 11450;
const correctVat = netAmount * 0.25;
const existingExpenseGross = 11450; // original gross
const existingExpenseNet = 9160; // original net (auto-computed by Tripletex from gross/vatType=1)
const existing2710 = 2290; // auto-generated from net 9160 * 0.25

console.log("net_amount (excl VAT):", netAmount);
console.log("correct_vat:", correctVat, "(should be 2862.50)");
console.log("existing 2710:", existing2710);
console.log("vat_shortfall:", correctVat - existing2710, "(should be 572.50)");
console.log("expense_net_shortfall:", netAmount - existingExpenseNet, "(should be 2290)");
console.log("total_shortfall:", (correctVat - existing2710) + (netAmount - existingExpenseNet), "(should be 2862.50)");

// After correction, final ledger should show:
// 6540 net: 9160 + 2290 = 11450 ✓ (the correct excl-VAT amount)
// 2710: 2290 + 572.50 = 2862.50 ✓ (11450 * 0.25)
// 2400: -(11450 + 2862.50) = -14312.50 ✓ (total incl VAT)
console.log("\n=== Expected final ledger state ===");
console.log("6540 total net:", existingExpenseNet + (netAmount - existingExpenseNet), "= 11450 ✓");
console.log("2710 total:", existing2710 + (correctVat - existing2710), "= 2862.50 ✓");
console.log("2400 total:", -(11450 + 2862.5), "= -14312.50 ✓ (original -11450 + correction -2862.50)");
