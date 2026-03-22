const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const voucherId = 609371919; // from our Check 5 investigation voucher

// Create a minimal valid PDF
const pdfContent = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer<</Root 1 0 R/Size 4>>
startxref
190
%%EOF`;

// Test 1: Upload PDF via POST /ledger/voucher/{id}/attachment
console.log("=== TEST 1: POST /ledger/voucher/{id}/attachment ===");
const formData = new FormData();
formData.append("file", new Blob([pdfContent], { type: "application/pdf" }), "invoice.pdf");

const res = await fetch(`${BASE}/ledger/voucher/${voucherId}/attachment`, {
  method: "POST",
  headers: { Authorization: AUTH },
  body: formData,
});
console.log("Status:", res.status);
const text = await res.text();
console.log("Response:", text.substring(0, 500));

// Check voucher state after upload
console.log("\n=== VOUCHER STATE AFTER UPLOAD ===");
const vRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?fields=id,description,number,document,attachment,ediDocument`, {
  headers: { Authorization: AUTH }
});
const vData = await vRes.json();
console.log(JSON.stringify(vData.value, null, 2));
