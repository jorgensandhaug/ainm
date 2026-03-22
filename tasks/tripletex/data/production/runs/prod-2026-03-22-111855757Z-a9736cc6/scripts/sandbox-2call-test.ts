// Sandbox test: Can we embed paymentTypeId in the invoice GET somehow, or use a default?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string) {
  const r = await fetch(BASE + path, { method, headers: { Authorization: AUTH } });
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} => ${r.status}`);
  return { status: r.status, json };
}

// Test 1: Can we use paymentTypeId=0 or omit it?
console.log("=== Test 1: PUT /:payment without paymentTypeId ===");
// Find an unpaid invoice first
const inv = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=5&sorting=-invoiceDate&fields=id,amountCurrencyOutstanding,amountOutstanding");
const invoices = inv.json.values || [];
const unpaid = invoices.find((i: any) => (i.amountCurrencyOutstanding ?? i.amountOutstanding) > 0);
if (unpaid) {
  console.log(`Found unpaid invoice ${unpaid.id}, outstanding=${unpaid.amountCurrencyOutstanding}`);
  // Try without paymentTypeId
  const r1 = await api("PUT", `/invoice/${unpaid.id}/:payment?paymentDate=2026-03-22&paidAmount=${unpaid.amountCurrencyOutstanding}`);
  console.log("Without paymentTypeId:", JSON.stringify(r1.json).substring(0, 500));
} else {
  console.log("No unpaid invoices found for test");
}

// Test 2: Check if /company/settings or similar exposes a default payment type
console.log("\n=== Test 2: Check /company for default payment type ===");
const comp = await api("GET", "/company?fields=*");
const companyData = comp.json?.value || comp.json?.values?.[0];
if (companyData) {
  // Look for any payment-related fields
  const paymentKeys = Object.keys(companyData).filter(k => k.toLowerCase().includes("payment") || k.toLowerCase().includes("bank"));
  console.log("Payment-related company fields:", paymentKeys);
  for (const k of paymentKeys) console.log(`  ${k}:`, companyData[k]);
}

// Test 3: Check if invoice locate response has any payment-related field we missed
console.log("\n=== Test 3: Check invoice fields for payment type info ===");
if (unpaid) {
  const detail = await api("GET", `/invoice/${unpaid.id}?fields=*`);
  const inv = detail.json?.value;
  if (inv) {
    const payKeys = Object.keys(inv).filter(k => k.toLowerCase().includes("payment") || k.toLowerCase().includes("bank") || k.toLowerCase().includes("type"));
    console.log("Payment/type fields on invoice:", payKeys);
    for (const k of payKeys) console.log(`  ${k}:`, JSON.stringify(inv[k]));
  }
}
