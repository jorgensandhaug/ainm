const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "yyG1ZFUqI8bfyFAQjR06aqUXgqDqZxRhqhv3pCPh7B0";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: Locate the paid invoice for Luz do Sol Lda (962812384), ex-VAT 41100
const invoiceUrl = `${BASE}/invoice?customerOrgNumber=962812384&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`;
const invoiceRes = await fetch(invoiceUrl, { headers });
const invoiceData = await invoiceRes.json();
console.log("Invoice search count:", invoiceData.count);

const invoices = invoiceData.values || [];
// Filter locally by ex-VAT amount
const target = invoices.length === 1
  ? invoices[0]
  : invoices.find((inv: any) => inv.amountExcludingVatCurrency === 41100);

if (!target) {
  console.error("Could not find target invoice");
  process.exit(1);
}

console.log("Invoice id:", target.id, "amountCurrency:", target.amountCurrency, "amountExcludingVatCurrency:", target.amountExcludingVatCurrency);

// Extract payment voucher from postings
const postings = target.postings || [];

// Prefer typed INCOMING_PAYMENT postings
let paymentPosting = postings.find((p: any) =>
  p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE"
);

// Fallback: unique negative Betaling posting
if (!paymentPosting) {
  const negBetaling = postings.filter((p: any) =>
    p.amountCurrency < 0 && p.description && p.description.startsWith("Betaling:")
  );
  if (negBetaling.length === 1) {
    paymentPosting = negBetaling[0];
  }
}

if (!paymentPosting) {
  console.error("Could not find payment posting");
  console.log("All postings:", JSON.stringify(postings.map((p: any) => ({
    type: p.type, desc: p.description, amt: p.amountCurrency, voucherId: p.voucher?.id
  })), null, 2));
  process.exit(1);
}

const paymentVoucherId = paymentPosting.voucher?.id;
console.log("Payment voucher id:", paymentVoucherId, "posting type:", paymentPosting.type, "amount:", paymentPosting.amountCurrency);

// Step 2: Reverse the payment voucher
const reverseUrl = `${BASE}/ledger/voucher/${paymentVoucherId}/:reverse?date=2026-03-22`;
const reverseRes = await fetch(reverseUrl, { method: "PUT", headers });
const reverseData = await reverseRes.json();
console.log("Reverse status:", reverseRes.status);
console.log("Reverse voucher id:", reverseData.value?.id);
