// Investigate task 11 - Part 3: Test PUT /supplierInvoice/:approve
// and check what POST /supplierInvoice needs (direct creation alternative)

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// Use the supplierInvoice we created in v1
const SI_ID = 2147644132; // from the EHF import flow

// ============================================================
// PART 1: GET supplierInvoice details before approve
// ============================================================
console.log("=== PART 1: GET /supplierInvoice/{id} with ALL fields ===");
const siRes = await fetch(`${BASE}/supplierInvoice/${SI_ID}?fields=*`, { headers: H });
console.log("Status:", siRes.status);
const siData = await siRes.json();
console.log(JSON.stringify(siData.value, null, 2));

// ============================================================
// PART 2: Try PUT /supplierInvoice/{id}/:approve
// ============================================================
console.log("\n=== PART 2: Try approve endpoint ===");

// Try different approve endpoint formats
const approveUrls = [
  `${BASE}/supplierInvoice/${SI_ID}/:approve`,
  `${BASE}/supplierInvoice/:approve?invoiceIds=${SI_ID}`,
];

for (const url of approveUrls) {
  console.log(`\n--- PUT ${url.replace(BASE, '')} ---`);
  const approveRes = await fetch(url, {
    method: "PUT",
    headers: H,
    body: JSON.stringify({}),
  });
  console.log("Status:", approveRes.status);
  const approveText = await approveRes.text();
  console.log("Response:", approveText.substring(0, 1000));
}

// ============================================================
// PART 3: GET supplierInvoice after approve attempt
// ============================================================
console.log("\n=== PART 3: GET /supplierInvoice/{id} AFTER approve ===");
const siAfterRes = await fetch(`${BASE}/supplierInvoice/${SI_ID}?fields=*`, { headers: H });
console.log("Status:", siAfterRes.status);
const siAfterData = await siAfterRes.json();
console.log(JSON.stringify(siAfterData.value, null, 2));

// ============================================================
// PART 4: Check OpenAPI for supplierInvoice POST structure
// ============================================================
console.log("\n=== PART 4: Check supplierInvoice WADL for POST params ===");
const wadlRes = await fetch(`${BASE}/supplierInvoice`, {
  method: "OPTIONS",
  headers: H,
});
const wadlText = await wadlRes.text();
console.log("Full WADL:");
console.log(wadlText);
