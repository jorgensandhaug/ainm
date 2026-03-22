const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "W6I6smJCcfL-RRIN_CgiGkadjORaiOMYREYY_alf1Cc";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: Locate the paid invoice for Strandvik AS (859256333), ex-VAT 41550
const invoiceUrl = `${BASE}/invoice?customerOrgNumber=859256333&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`;
const r1 = await fetch(invoiceUrl, { headers: H });
const d1 = await r1.json();
console.log("Invoice search count:", d1.count);

const invoices = (d1.values || []).filter(
  (inv: any) => inv.amountExcludingVatCurrency === 41550
);
if (invoices.length !== 1) {
  console.error("Expected exactly 1 invoice with ex-VAT 41550, got", invoices.length);
  if (d1.count === 1) {
    console.log("Only 1 invoice total, using it directly");
    invoices.length = 0;
    invoices.push(d1.values[0]);
  } else {
    process.exit(1);
  }
}
const invoice = invoices[0];
console.log("Invoice id:", invoice.id, "amountCurrency:", invoice.amountCurrency, "amountExcludingVatCurrency:", invoice.amountExcludingVatCurrency);

// Extract payment voucher from postings
const postings = invoice.postings || [];
// Prefer INCOMING_PAYMENT typed postings
let paymentPosting = postings.find(
  (p: any) => p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE"
);
// Fallback: unique negative Betaling posting with type=null
if (!paymentPosting) {
  const negBetaling = postings.filter(
    (p: any) => p.amountCurrency < 0 && p.description && p.description.startsWith("Betaling:")
  );
  if (negBetaling.length === 1) {
    paymentPosting = negBetaling[0];
  }
}
if (!paymentPosting) {
  console.error("Could not find payment posting");
  console.log("Postings:", JSON.stringify(postings.map((p: any) => ({ type: p.type, amount: p.amountCurrency, desc: p.description, voucherId: p.voucher?.id })), null, 2));
  process.exit(1);
}
const paymentVoucherId = paymentPosting.voucher?.id;
console.log("Payment voucher id:", paymentVoucherId, "posting desc:", paymentPosting.description);

// Step 2: Reverse the payment voucher
const reverseUrl = `${BASE}/ledger/voucher/${paymentVoucherId}/:reverse?date=2026-03-22`;
const r2 = await fetch(reverseUrl, { method: "PUT", headers: H });
const d2 = await r2.json();
console.log("Reverse status:", r2.status);
console.log("Reverse voucher id:", d2.value?.id);
if (r2.status >= 400) {
  console.error("Reverse failed:", JSON.stringify(d2));
  process.exit(1);
}
console.log("Done. Payment reversed successfully.");
