const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: Find incoming payment type
const ptR = await fetch(`${BASE}/invoice/paymentType?count=100&fields=*,debitAccount(*),creditAccount(*)`, { headers: h });
const ptD = await ptR.json();
console.log("Invoice payment types:", ptR.status, "count:", ptD.count);
const paymentType = ptD.values?.find((pt: any) => String(pt.debitAccount?.number || "").startsWith("19")) || ptD.values?.[0];
console.log("Using payment type:", paymentType?.id, paymentType?.description, "debitAcct:", paymentType?.debitAccount?.number);

// Step 2: Pay the existing unpaid invoice from earlier (2147642910)
const invoiceId = 2147642910;
const amt = 29500;
const payR = await fetch(`${BASE}/invoice/${invoiceId}/:payment?paymentDate=2026-03-21&paymentTypeId=${paymentType.id}&paidAmount=${amt}&paidAmountCurrency=${amt}`, {
  method: "PUT",
  headers: h,
});
const payD = await payR.json();
console.log("Payment:", payR.status, JSON.stringify(payD).slice(0, 300));

if (!payR.ok) {
  console.error("Payment failed");
  process.exit(1);
}

// Step 3: Now run the production 2-call reversal path
console.log("\n=== PRODUCTION 2-CALL PATH ===\n");

// Call 1: GET invoice with full postings
const r1 = await fetch(`${BASE}/invoice/${invoiceId}?fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`, { headers: h });
const d1 = await r1.json();
console.log("Call 1 - Invoice:", r1.status, "amount:", d1.value?.amountCurrency, "outstanding:", d1.value?.amountCurrencyOutstanding, "exVat:", d1.value?.amountExcludingVatCurrency);

const postings = d1.value?.postings || [];
console.log("All postings:");
postings.forEach((p: any, i: number) => console.log(`  [${i}]`, { desc: p.description?.slice(0, 60), amt: p.amountCurrency, voucherId: p.voucher?.id, type: p.type, acct: p.account?.number }));

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

  // Verification (extra, not part of scored path)
  const verR = await fetch(`${BASE}/invoice/${invoiceId}?fields=amountCurrencyOutstanding,amountCurrency,amountExcludingVatCurrency`, { headers: h });
  const verD = await verR.json();
  console.log("\nVerification - outstanding:", verD.value?.amountCurrencyOutstanding, "amountCurrency:", verD.value?.amountCurrency, "exVat:", verD.value?.amountExcludingVatCurrency);
  console.log("Success:", verD.value?.amountCurrencyOutstanding === verD.value?.amountCurrency ? "YES - invoice reopened to full amount" : "NO");
} else {
  console.error("Unexpected voucher count:", voucherIds.length);
}
