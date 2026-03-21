const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Test 1: Can we embed paymentType in the invoice read to avoid a separate GET /invoice/paymentType?
console.log("=== Test 1: GET /invoice with paymentType(*) expansion ===");
const url1 = `${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=5&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),paymentType(*)`;
const res1 = await fetch(url1, { headers: H });
console.log("Status:", res1.status);
if (res1.ok) {
  const data1 = await res1.json();
  const inv = data1.values?.[0];
  console.log("First invoice paymentType:", JSON.stringify(inv?.paymentType));
  console.log("First invoice keys:", Object.keys(inv || {}));
} else {
  const err = await res1.text();
  console.log("Error:", err);
}

// Test 2: Does GET /invoice expose any payment-related fields by default?
console.log("\n=== Test 2: Check invoice for payment-related fields ===");
const url2 = `${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1&sorting=-invoiceDate&fields=*`;
const res2 = await fetch(url2, { headers: H });
console.log("Status:", res2.status);
if (res2.ok) {
  const data2 = await res2.json();
  const inv = data2.values?.[0];
  // Check if there are any payment-type related fields
  const paymentKeys = Object.keys(inv || {}).filter(k => k.toLowerCase().includes("payment") || k.toLowerCase().includes("paymenttype"));
  console.log("Payment-related keys:", paymentKeys);
  for (const k of paymentKeys) {
    console.log(`  ${k}:`, JSON.stringify(inv[k]));
  }
}

// Test 3: Can we use PUT /invoice/:payment without paymentTypeId? (already proven to fail, but re-confirm)
// Skip - already confirmed by trusted standard that paymentTypeId is required

// Test 4: Try GET /invoice/paymentType with minimal fields to see if there's a default one we can predict
console.log("\n=== Test 3: GET /invoice/paymentType - full list ===");
const url3 = `${BASE}/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`;
const res3 = await fetch(url3, { headers: H });
console.log("Status:", res3.status);
if (res3.ok) {
  const data3 = await res3.json();
  console.log("Total payment types:", data3.values?.length);
  for (const pt of data3.values || []) {
    console.log(`  ID: ${pt.id}, desc: ${pt.description}, name: ${pt.name}, debit: ${pt.debitAccount?.number}, credit: ${pt.creditAccount?.number}`);
  }
}

console.log("\n=== Done ===");
