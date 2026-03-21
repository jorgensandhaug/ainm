// Investigate task 11 - Part 2: Fix supplierInvoice queries and test POST

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// ============================================================
// PART 1: Get supplierInvoice with proper query params
// ============================================================
console.log("=== PART 1: GET /supplierInvoice with dateFrom/dateTo ===");

// The 422 was because /supplierInvoice probably needs dateFrom/dateTo like vouchers
const siRes1 = await fetch(
  `${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&count=5&sorting=-id&fields=*`,
  { headers: H }
);
console.log("Status:", siRes1.status);
if (siRes1.ok) {
  const siData1 = await siRes1.json();
  console.log("Count:", siData1.fullResultSize);
  for (const si of (siData1.values || [])) {
    console.log("\n--- SupplierInvoice id:", si.id, "---");
    console.log(JSON.stringify(si, null, 2));
  }
} else {
  const errData = await siRes1.json();
  console.log("Error:", JSON.stringify(errData, null, 2));
}

// Try with fewer fields and different params
console.log("\n=== Try without date params ===");
const siRes2 = await fetch(
  `${BASE}/supplierInvoice?count=3&sorting=-id&fields=id,invoiceNumber,amount,amountCurrency,invoiceDate,paymentTypeId,supplier(id,name),voucher(id,number)`,
  { headers: H }
);
console.log("Status:", siRes2.status);
if (siRes2.ok) {
  const siData2 = await siRes2.json();
  console.log("Count:", siData2.fullResultSize);
  for (const si of (siData2.values || [])) {
    console.log(JSON.stringify(si, null, 2));
  }
} else {
  const errData2 = await siRes2.json();
  console.log("Error:", JSON.stringify(errData2, null, 2));
}

// ============================================================
// PART 2: Try POST /supplierInvoice with correct fields
// ============================================================
console.log("\n=== PART 2: POST /supplierInvoice (correct fields) ===");

// First, find the supplierInvoice object structure from OpenAPI
// Let's try with invoiceDate instead of dueDate
const supplierId = 108439410; // from previous test
const postSiRes = await fetch(`${BASE}/supplierInvoice`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    supplier: { id: supplierId },
    invoiceNumber: "DIRECT-POST-TEST-001",
    invoiceDate: "2026-03-21",
    amount: -42100,
    amountCurrency: -42100,
    currency: { id: 1 },
  }),
});
console.log("POST /supplierInvoice status:", postSiRes.status);
const postSiData = await postSiRes.json();
console.log("Response:", JSON.stringify(postSiData, null, 2));

// ============================================================
// PART 3: Check the OpenAPI spec for supplierInvoice endpoints
// ============================================================
console.log("\n=== PART 3: OPTIONS /supplierInvoice ===");
const optRes = await fetch(`${BASE}/supplierInvoice`, {
  method: "OPTIONS",
  headers: H,
});
console.log("OPTIONS status:", optRes.status);
try {
  const optText = await optRes.text();
  console.log("Response:", optText.substring(0, 500));
} catch (e) {
  console.log("Error reading response");
}
