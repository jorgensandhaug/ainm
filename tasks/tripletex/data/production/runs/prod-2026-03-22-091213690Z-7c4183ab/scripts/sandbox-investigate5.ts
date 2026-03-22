const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Check the order line on the supplier invoice
console.log("=== Order Line ===");
const olRes = await fetch(`${BASE}/order/orderline/1607606501?fields=*`, {
  headers: { Authorization: AUTH }
});
const olData = await olRes.json();
console.log(JSON.stringify(olData.value, null, 2));

// Check the voucher postings amount details more carefully
// Try looking at WHAT the scoring engine checks
// Look at supplier invoice with ALL possible fields
console.log("\n=== Full SI with all fields ===");
const siRes = await fetch(`${BASE}/supplierInvoice?supplierId=108568022&invoiceDateFrom=2025-01-01&invoiceDateTo=2027-01-01&fields=*`, {
  headers: { Authorization: AUTH }
});
const siData = await siRes.json();
console.log(JSON.stringify(siData.values[0], null, 2));

// What if we need a KID number? Let me check the voucher description
console.log("\n=== Voucher description details ===");
const vRes = await fetch(`${BASE}/ledger/voucher/609370008?fields=*`, {
  headers: { Authorization: AUTH }
});
const vData = await vRes.json();
console.log("Voucher description:", vData.value.description);
console.log("vendorInvoiceNumber:", vData.value.vendorInvoiceNumber);
console.log("externalVoucherNumber:", vData.value.externalVoucherNumber);
