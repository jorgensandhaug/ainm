const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Approach 1: Can we get paymentType info embedded in /invoice response with alternative field expansions?
console.log("=== Approach 1: Try alternative field expansions on GET /invoice ===");

// Already proven: fields=*,paymentType(*) returns 400
// Try: fields=*,payments(*) or fields=*,payment(*)
for (const expansion of ["payments(*)", "payment(*)", "paymentTypes(*)"]) {
  const url = `${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1&fields=*,${expansion}`;
  const res = await fetch(url, { headers: H });
  console.log(`  fields=*,${expansion}: ${res.status}`);
  if (!res.ok) {
    const body = await res.text();
    console.log(`    body: ${body.slice(0, 200)}`);
  }
}

// Approach 2: Is there a /company/settings or /company endpoint that exposes default payment types?
console.log("\n=== Approach 2: Check /company for default payment type info ===");
const compRes = await fetch(`${BASE}/company?fields=*`, { headers: H });
console.log(`GET /company: ${compRes.status}`);
if (compRes.ok) {
  const compData = await compRes.json();
  const v = compData.value || compData;
  // Look for any payment-related fields
  const paymentKeys = Object.keys(v).filter(k => k.toLowerCase().includes("payment") || k.toLowerCase().includes("bank"));
  console.log(`  Payment/bank related keys: ${JSON.stringify(paymentKeys)}`);
  for (const k of paymentKeys) {
    console.log(`  ${k}: ${JSON.stringify(v[k])}`);
  }
}

// Approach 3: Can we call PUT /:payment with paymentTypeId=0 or some sentinel?
console.log("\n=== Approach 3: Check if there's a default paymentTypeId sentinel ===");
// Find an unpaid invoice first
const invRes = await fetch(`${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=5&sorting=-invoiceDate&fields=*,customer(*),orderLines(*)`, { headers: H });
const invData = await invRes.json();
const unpaid = (invData.values || []).find((inv: any) => (inv.amountCurrencyOutstanding ?? inv.amountOutstanding ?? 0) > 0);
if (unpaid) {
  console.log(`Found unpaid invoice ${unpaid.id}, outstanding=${unpaid.amountCurrencyOutstanding}`);
  // Don't actually pay it - just test with an obviously wrong paymentTypeId to see error shape
  const testUrl = `${BASE}/invoice/${unpaid.id}/:payment?paymentDate=2026-03-21&paymentTypeId=0&paidAmount=${unpaid.amountCurrencyOutstanding}`;
  const testRes = await fetch(testUrl, { method: "PUT", headers: H });
  console.log(`PUT with paymentTypeId=0: ${testRes.status}`);
  const testBody = await testRes.text();
  console.log(`  body: ${testBody.slice(0, 300)}`);
} else {
  console.log("No unpaid invoice found in sandbox");
}

// Approach 4: Check /ledger/paymentType for any shortcut
console.log("\n=== Approach 4: Check /ledger/paymentType ===");
const lptRes = await fetch(`${BASE}/ledger/paymentType?count=5&fields=*`, { headers: H });
console.log(`GET /ledger/paymentType: ${lptRes.status}`);
if (lptRes.ok) {
  const lptData = await lptRes.json();
  console.log(`  count: ${lptData.count}, fullResultSize: ${lptData.fullResultSize}`);
  if (lptData.values?.[0]) {
    console.log(`  first entry keys: ${Object.keys(lptData.values[0]).join(", ")}`);
    console.log(`  first entry: ${JSON.stringify(lptData.values[0])}`);
  }
}
