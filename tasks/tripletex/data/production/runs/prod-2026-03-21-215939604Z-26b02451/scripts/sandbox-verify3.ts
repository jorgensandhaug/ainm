const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

// Find incoming payment types
const ptR = await fetch(`${BASE}/ledger/paymentTypeOut?isIncoming=true&count=50&fields=*`, { headers: h });
const ptD = await ptR.json();
console.log("Incoming payment types:", ptR.status, "count:", ptD.count);
ptD.values?.forEach((pt: any) => console.log("  ", pt.id, pt.description, "isIncoming:", pt.isIncoming));

const incomingType = ptD.values?.find((pt: any) => pt.isIncoming);
if (!incomingType) {
  console.error("No incoming payment type found");
  process.exit(1);
}

console.log("\nUsing payment type:", incomingType.id, incomingType.description);

// Pay the invoice
const invoiceId = 2147642910;
const amt = 29500;
const payR = await fetch(`${BASE}/invoice/${invoiceId}/:payment?paymentDate=2026-03-21&paymentTypeId=${incomingType.id}&paidAmount=${amt}&paidAmountCurrency=${amt}`, {
  method: "PUT",
  headers: h,
});
const payD = await payR.json();
console.log("Payment:", payR.status, JSON.stringify(payD).slice(0, 500));

if (!payR.ok) {
  process.exit(1);
}

// Now simulate the production 2-call path
console.log("\n=== PRODUCTION 2-CALL PATH ===\n");

// Call 1: GET invoice with postings
const r1 = await fetch(`${BASE}/invoice/${invoiceId}?fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`, { headers: h });
const d1 = await r1.json();
console.log("Call 1 - Invoice:", r1.status, "amount:", d1.value?.amountCurrency, "outstanding:", d1.value?.amountCurrencyOutstanding);

const postings = d1.value?.postings || [];
console.log("Postings count:", postings.length);
postings.forEach((p: any) => console.log("  posting:", { desc: p.description, amt: p.amountCurrency, voucherId: p.voucher?.id, type: p.type, acct: p.account?.number }));

const paymentPostings = postings.filter((p: any) =>
  (p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE") ||
  (p.amountCurrency < 0 && p.description && p.description.startsWith("Betaling:"))
);
const voucherIds = [...new Set(paymentPostings.map((p: any) => p.voucher?.id).filter(Boolean))];
console.log("Payment voucher ids:", voucherIds);

if (voucherIds.length === 1) {
  // Call 2: Reverse
  const r2 = await fetch(`${BASE}/ledger/voucher/${voucherIds[0]}/:reverse?date=2026-03-21`, { method: "PUT", headers: h });
  const d2 = await r2.json();
  console.log("\nCall 2 - Reverse:", r2.status, "reverse voucher id:", d2.value?.id);

  // Verify (not part of scored calls)
  const verR = await fetch(`${BASE}/invoice/${invoiceId}?fields=amountCurrencyOutstanding,amountCurrency,amountExcludingVatCurrency`, { headers: h });
  const verD = await verR.json();
  console.log("\nVerification - outstanding:", verD.value?.amountCurrencyOutstanding, "amountCurrency:", verD.value?.amountCurrency, "exVat:", verD.value?.amountExcludingVatCurrency);
  console.log("Success:", verD.value?.amountCurrencyOutstanding === verD.value?.amountCurrency ? "YES - invoice reopened" : "NO");
}
