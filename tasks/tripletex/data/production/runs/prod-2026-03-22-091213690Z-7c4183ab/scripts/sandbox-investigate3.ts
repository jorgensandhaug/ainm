const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const voucherId = 609370008;

// Get postings for just this voucher
console.log("=== Postings for voucher ===");
const pRes = await fetch(`${BASE}/ledger/posting?dateFrom=2026-01-01&dateTo=2026-12-31&voucherId=${voucherId}&fields=*`, {
  headers: { Authorization: AUTH }
});
const pData = await pRes.json();
for (const p of pData.values) {
  console.log(JSON.stringify(p, null, 2));
  console.log("---");
}

// Also check: what does the voucher type resolve to?
console.log("\n=== Voucher Type ===");
const vtRes = await fetch(`${BASE}/ledger/voucherType/9744845?fields=*`, {
  headers: { Authorization: AUTH }
});
const vtData = await vtRes.json();
console.log(JSON.stringify(vtData.value, null, 2));
