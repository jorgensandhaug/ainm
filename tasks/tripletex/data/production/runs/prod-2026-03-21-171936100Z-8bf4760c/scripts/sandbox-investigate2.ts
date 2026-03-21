// Test: Can we combine multiple supplier payments into ONE voucher with multiple postings?
// This would reduce 3 POST /ledger/voucher calls to 1.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} -> ${r.status}`);
  if (!r.ok) {
    console.error("  ERROR:", JSON.stringify(data).slice(0, 500));
    return null;
  }
  return data;
}

// First, get suppliers to use
const supplierRes = await api("GET", "/supplier?count=10&fields=*");
const suppliers = supplierRes?.values || [];
console.log(`Suppliers: ${suppliers.length}`);

// Get account IDs for 2400 and 1920
const accountRes = await api("GET", "/ledger/account?number=2400,1920&fields=*");
const accounts = accountRes?.values || [];
const acc2400 = accounts.find((a: any) => a.number === 2400);
const acc1920 = accounts.find((a: any) => a.number === 1920);
console.log(`Account 2400 id=${acc2400?.id}, Account 1920 id=${acc1920?.id}`);

if (suppliers.length < 3) {
  console.log("Not enough suppliers for multi-supplier test, creating test suppliers...");
  for (let i = 0; i < 3 - suppliers.length; i++) {
    const s = await api("POST", "/supplier", {
      name: `Test Reconcile Supplier ${Date.now()}_${i} AS`,
      organizationNumber: `9${String(90000000 + Math.floor(Math.random() * 9999999)).padStart(8, '0')}`,
    });
    if (s?.value) suppliers.push(s.value);
  }
}

// Test: Create ONE voucher with 3 supplier payments (6 postings total)
const sup1 = suppliers[0];
const sup2 = suppliers[1];
const sup3 = suppliers[2];
console.log(`\nTesting combined voucher with 3 suppliers:`);
console.log(`  ${sup1.id}: ${sup1.name}`);
console.log(`  ${sup2.id}: ${sup2.name}`);
console.log(`  ${sup3.id}: ${sup3.name}`);

const combinedVoucher = await api("POST", "/ledger/voucher", {
  date: "2026-01-27",
  description: "Bank reconciliation - supplier payments",
  postings: [
    // Supplier 1: 11500
    { row: 1, date: "2026-01-27", account: { id: acc2400.id }, amountGross: 11500, amountGrossCurrency: 11500, supplier: { id: sup1.id } },
    { row: 2, date: "2026-01-27", account: { id: acc1920.id }, amountGross: -11500, amountGrossCurrency: -11500 },
    // Supplier 2: 6400
    { row: 3, date: "2026-01-30", account: { id: acc2400.id }, amountGross: 6400, amountGrossCurrency: 6400, supplier: { id: sup2.id } },
    { row: 4, date: "2026-01-30", account: { id: acc1920.id }, amountGross: -6400, amountGrossCurrency: -6400 },
    // Supplier 3: 6200
    { row: 5, date: "2026-02-01", account: { id: acc2400.id }, amountGross: 6200, amountGrossCurrency: 6200, supplier: { id: sup3.id } },
    { row: 6, date: "2026-02-01", account: { id: acc1920.id }, amountGross: -6200, amountGrossCurrency: -6200 },
  ],
});

if (combinedVoucher) {
  console.log(`\nCombined voucher SUCCESS!`);
  console.log(`  Voucher ID: ${combinedVoucher.value?.id}`);
  console.log(`  Postings count: ${combinedVoucher.value?.postings?.length || 'N/A'}`);
  console.log(`  Full response (snippet): ${JSON.stringify(combinedVoucher.value).slice(0, 500)}`);
} else {
  console.log(`\nCombined voucher FAILED. Must use separate vouchers.`);
}

// Also test: Can we batch customer payments? (probably not, but check)
// Check if there's a batch payment endpoint
console.log("\n=== Checking if batch customer payment exists ===");
// The playbook says PUT /invoice/{id}/:payment per invoice, no batch
// Let's verify by looking at whether parallel calls work
