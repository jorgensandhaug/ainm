// Explore if there's a way to get paymentTypeId from invoice or related endpoints
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Try 1: Can we get paymentType info from the company settings?
const compRes = await fetch(`${BASE}/company?fields=*`, { headers: H });
console.log("GET /company status:", compRes.status);
if (compRes.ok) {
  const cd = await compRes.json();
  const v = cd.value || cd.values?.[0];
  // Check for any payment-related fields
  const keys = Object.keys(v || {}).filter(k => k.toLowerCase().includes("payment") || k.toLowerCase().includes("bank"));
  console.log("Company payment-related keys:", keys);
}

// Try 2: Can we expand voucher(*) on invoice to get payment info?
const invRes = await fetch(`${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=5&sorting=-invoiceDate&fields=*,voucher(*)`, { headers: H });
console.log("\nGET /invoice with voucher(*) status:", invRes.status);
if (invRes.ok) {
  const invData = await invRes.json();
  const inv = invData.values?.[0];
  if (inv) {
    console.log("Voucher fields:", Object.keys(inv.voucher || {}));
  }
}

// Try 3: Check if there's a default payment type via /ledger/account
const accRes = await fetch(`${BASE}/ledger/account?number=1920&count=1&fields=*`, { headers: H });
console.log("\nGET /ledger/account?number=1920 status:", accRes.status);
if (accRes.ok) {
  const accData = await accRes.json();
  console.log("Account 1920:", JSON.stringify(accData.values?.[0], null, 2));
}
