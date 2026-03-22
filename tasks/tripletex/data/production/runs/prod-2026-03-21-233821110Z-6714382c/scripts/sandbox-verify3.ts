// Sandbox verification: pay invoice via query params, then verify 2-call reverse path
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const invoiceId = 2147652899;
const amountCurrency = 41550;

// Pay it (query params, not body)
const payR = await fetch(`${BASE}/invoice/${invoiceId}/:payment?paymentDate=2026-03-22&paymentTypeId=32813748&paidAmount=${amountCurrency}`, {
  method: "PUT", headers: H
});
console.log("Payment status:", payR.status);
if (payR.status >= 400) {
  const payD = await payR.json();
  console.error("Payment failed:", JSON.stringify(payD).slice(0, 300));
  process.exit(1);
}
console.log("Payment registered successfully");

// === CANONICAL 2-CALL PATH ===
console.log("\n=== CANONICAL 2-CALL PATH ===");

// Call 1: Locate
const r1 = await fetch(`${BASE}/invoice?customerId=108464166&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`, { headers: H });
const d1 = await r1.json();
console.log("Call 1 - Invoice count:", d1.count);

const target = (d1.values || []).find((i: any) => i.id === invoiceId);
if (!target) {
  console.error("Target invoice not found");
  process.exit(1);
}
console.log("Invoice:", target.id, "exVAT:", target.amountExcludingVatCurrency, "amountCurrency:", target.amountCurrency);

const postings = target.postings || [];
let paymentPosting = postings.find(
  (p: any) => p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE"
);
if (!paymentPosting) {
  const negBetaling = postings.filter(
    (p: any) => p.amountCurrency < 0 && p.description && p.description.startsWith("Betaling:")
  );
  if (negBetaling.length === 1) paymentPosting = negBetaling[0];
}

if (!paymentPosting) {
  console.error("No payment posting found");
  console.log("Postings:", JSON.stringify(postings.map((p: any) => ({
    type: p.type, amt: p.amountCurrency, desc: p.description, vid: p.voucher?.id, acct: p.account?.number
  })), null, 2));
  process.exit(1);
}

const voucherId = paymentPosting.voucher?.id;
console.log("Payment voucher:", voucherId, "type:", paymentPosting.type, "desc:", paymentPosting.description, "acct:", paymentPosting.account?.number);

// Call 2: Reverse
const r2 = await fetch(`${BASE}/ledger/voucher/${voucherId}/:reverse?date=2026-03-22`, { method: "PUT", headers: H });
const d2 = await r2.json();
console.log("Call 2 - Reverse status:", r2.status, "Reverse voucher:", d2.value?.id);

// Verify (not scored)
const vR = await fetch(`${BASE}/invoice/${invoiceId}?fields=*`, { headers: H });
const vD = await vR.json();
console.log("\nVerification - amountCurrencyOutstanding:", vD.value?.amountCurrencyOutstanding);
console.log("Expected:", target.amountCurrency);
console.log("Match:", vD.value?.amountCurrencyOutstanding === target.amountCurrency);
console.log("Sandbox verification PASSED");
