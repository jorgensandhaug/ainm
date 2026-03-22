const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const supplierId = 108568022;
const voucherId = 609370008;

// Get supplier invoice with date range
console.log("=== Supplier Invoice ===");
const siRes = await fetch(`${BASE}/supplierInvoice?supplierId=${supplierId}&invoiceDateFrom=2025-01-01&invoiceDateTo=2027-01-01&fields=*`, {
  headers: { Authorization: AUTH }
});
const siData = await siRes.json();
console.log(JSON.stringify(siData, null, 2));

// Get postings with date range
console.log("\n=== Postings ===");
const pRes = await fetch(`${BASE}/ledger/posting?voucherId=${voucherId}&dateFrom=2025-01-01&dateTo=2027-01-01&fields=*`, {
  headers: { Authorization: AUTH }
});
const pData = await pRes.json();
console.log(JSON.stringify(pData, null, 2));
