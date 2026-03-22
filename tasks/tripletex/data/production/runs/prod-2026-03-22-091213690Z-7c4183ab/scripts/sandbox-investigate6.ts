const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Check the approval list elements
console.log("=== Approval List Elements ===");
for (const id of [647516662, 647516663]) {
  const res = await fetch(`${BASE}/voucherApprovalListElement/${id}?fields=*`, {
    headers: { Authorization: AUTH }
  });
  const data = await res.json();
  console.log(JSON.stringify(data.value, null, 2));
  console.log("---");
}

// Check if there's a way to approve the supplier invoice
console.log("\n=== Check supplierInvoice endpoints ===");
// Try to see what fields are on the SI
const siRes = await fetch(`${BASE}/supplierInvoice/2147687722?fields=*`, {
  headers: { Authorization: AUTH }
});
const siData = await siRes.json();
console.log("SI fields:", JSON.stringify(siData.value, null, 2));

// Check what the posting row 1 amount is - specifically the VAT calculation
console.log("\n=== Row 1 posting amount precision ===");
const pRes = await fetch(`${BASE}/ledger/posting/3846380613?fields=*`, {
  headers: { Authorization: AUTH }
});
const pData = await pRes.json();
console.log("Row 1 amount:", pData.value.amount);
console.log("Row 1 amountGross:", pData.value.amountGross);
console.log("Row 1 amountCurrency:", pData.value.amountCurrency);
console.log("Row 1 amountGrossCurrency:", pData.value.amountGrossCurrency);

// Check the VAT posting (auto-generated row 0)
const p2Res = await fetch(`${BASE}/ledger/posting/3846380619?fields=*`, {
  headers: { Authorization: AUTH }
});
const p2Data = await p2Res.json();
console.log("\nRow 0 (VAT) amount:", p2Data.value.amount);
console.log("Row 0 (VAT) amountGross:", p2Data.value.amountGross);
