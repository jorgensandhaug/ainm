const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const hdrs: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

// Check if GET /invoice with payment-type expansion gives us a reusable id
console.log("=== Probe: GET /invoice with paymentType expansion ===");
const res = await fetch(`${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1&sorting=-invoiceDate&fields=*,paymentType(*)`, { headers: hdrs });
const data = await res.json();
console.log("Status:", res.status);
if (data.values?.[0]) {
  const inv = data.values[0];
  // Show all keys
  console.log("All keys:", Object.keys(inv).sort().join(", "));
  // Show payment related
  const ptKeys = Object.keys(inv).filter(k => k.toLowerCase().includes("payment"));
  console.log("Payment keys:", ptKeys);
  for (const k of ptKeys) {
    console.log(`  ${k}:`, JSON.stringify(inv[k]));
  }
}

// Also test: can we successfully pay an invoice using the known sandbox paymentTypeId=32813748
// in just 2 calls (skip paymentType read)?
// Find a small unpaid invoice
console.log("\n=== Test: 2-call payment with known paymentTypeId ===");
const invRes = await fetch(`${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=50&sorting=-invoiceDate&fields=*,customer(*),orderLines(*)`, { headers: hdrs });
const invData = await invRes.json();
const unpaid = (invData.values || []).filter((inv: any) => (inv.amountCurrencyOutstanding ?? inv.amountOutstanding ?? 0) > 0);
console.log("Unpaid:", unpaid.length);

if (unpaid.length > 0) {
  // Pick the smallest unpaid invoice
  const sorted = unpaid.sort((a: any, b: any) => (a.amountCurrencyOutstanding ?? a.amountOutstanding) - (b.amountCurrencyOutstanding ?? b.amountOutstanding));
  const target = sorted[0];
  const outstanding = target.amountCurrencyOutstanding ?? target.amountOutstanding;
  console.log(`Target: id=${target.id} outstanding=${outstanding}`);

  // Pay it with the known sandbox paymentTypeId
  const payRes = await fetch(`${BASE}/invoice/${target.id}/:payment?paymentDate=2026-03-21&paymentTypeId=32813748&paidAmount=${outstanding}`, { method: "PUT", headers: hdrs });
  const payData = await payRes.json();
  console.log("Pay status:", payRes.status);
  const remaining = payData.value?.amountCurrencyOutstanding ?? payData.value?.amountOutstanding ?? "unknown";
  console.log("Remaining outstanding:", remaining);
  if (remaining === 0) console.log("SUCCESS: 2-call path works with cached paymentTypeId");
}
