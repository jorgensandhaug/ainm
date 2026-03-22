// Sandbox verification: find a usable date, then test the 2-call reverse path
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Check bank statements to find a date without reconciled statements
const bsR = await fetch(`${BASE}/bank/statement?count=5&sorting=-toDate&fields=id,fromDate,toDate`, { headers: H });
const bsD = await bsR.json();
console.log("Bank statements:", JSON.stringify(bsD.values?.map((s: any) => ({ id: s.id, from: s.fromDate, to: s.toDate })), null, 2));

// Try using invoice 2147653159 that's already created, just need a valid payment date
// Let me try 2027-01-15
const DATE = "2027-01-15";
const invoiceId = 2147653159;

const payR = await fetch(`${BASE}/invoice/${invoiceId}/:payment?paymentDate=${DATE}&paymentTypeId=32813748&paidAmount=41550`, {
  method: "PUT", headers: H
});
console.log("Payment status:", payR.status);
if (payR.status >= 400) {
  const payD = await payR.json();
  console.error("Payment failed:", JSON.stringify(payD).slice(0, 500));

  // Try different payment type
  const ptR = await fetch(`${BASE}/invoice/paymentType?count=20`, { headers: H });
  const ptD = await ptR.json();
  console.log("Available payment types:", JSON.stringify(ptD.values?.map((p: any) => ({ id: p.id, desc: p.description })), null, 2));
  process.exit(1);
}

console.log("Payment registered");

// 2-call canonical path
console.log("\n=== 2-CALL PATH ===");
const r1 = await fetch(`${BASE}/invoice?customerId=108464805&invoiceDateFrom=2000-01-01&invoiceDateTo=2028-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`, { headers: H });
const d1 = await r1.json();
console.log("Call 1 - count:", d1.count);

const target = (d1.values || []).find((i: any) => i.id === invoiceId);
if (!target) { console.error("Not found"); process.exit(1); }

const postings = target.postings || [];
let pp = postings.find((p: any) => p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE");
if (!pp) {
  const neg = postings.filter((p: any) => p.amountCurrency < 0 && p.description?.startsWith("Betaling:"));
  if (neg.length === 1) pp = neg[0];
}
if (!pp) { console.error("No payment posting"); process.exit(1); }

console.log("Voucher:", pp.voucher?.id, "type:", pp.type);

const r2 = await fetch(`${BASE}/ledger/voucher/${pp.voucher?.id}/:reverse?date=${DATE}`, { method: "PUT", headers: H });
const d2 = await r2.json();
console.log("Call 2 - Reverse status:", r2.status, "Reverse voucher:", d2.value?.id);

const vR = await fetch(`${BASE}/invoice/${invoiceId}?fields=*`, { headers: H });
const vD = await vR.json();
console.log("\nVerification:", vD.value?.amountCurrencyOutstanding, "===", target.amountCurrency, "→", vD.value?.amountCurrencyOutstanding === target.amountCurrency);
