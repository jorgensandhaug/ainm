const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "GXvKh1aRvoaQvzMgUoo3lY9VTA9iyHw9LPMMlzNDfB8";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: Locate the paid invoice for Windmill Ltd (858237033), ex-VAT 25500
const invoiceUrl = `${BASE}/invoice?customerOrgNumber=858237033&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`;
const r1 = await fetch(invoiceUrl, { headers: H });
if (!r1.ok) { console.error("GET /invoice failed:", r1.status, await r1.text()); process.exit(1); }
const data1 = await r1.json();
console.log("Invoice search count:", data1.count);

const invoices = data1.values;
// Filter by ex-VAT amount if multiple
let target = invoices.length === 1
  ? invoices[0]
  : invoices.find((inv: any) => inv.amountExcludingVatCurrency === 25500);

if (!target) { console.error("No matching invoice found"); process.exit(1); }
console.log("Target invoice:", target.id, "amountCurrency:", target.amountCurrency, "amountExcludingVatCurrency:", target.amountExcludingVatCurrency);

// Extract payment voucher from postings — look for unique negative Betaling posting
const postings = target.postings || [];
let paymentPosting = postings.find((p: any) =>
  p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE"
);
if (!paymentPosting) {
  // Fallback: unique negative Betaling posting with type=null
  paymentPosting = postings.find((p: any) =>
    p.amountCurrency < 0 && p.description && p.description.startsWith("Betaling:")
  );
}
if (!paymentPosting) { console.error("No payment posting found. Postings:", JSON.stringify(postings, null, 2)); process.exit(1); }

const paymentVoucherId = paymentPosting.voucher?.id;
if (!paymentVoucherId) { console.error("No voucher id on payment posting"); process.exit(1); }
console.log("Payment voucher ID:", paymentVoucherId);

// Check that this is not a shared voucher with the invoice posting
const invoicePostingVoucherIds = new Set(
  postings.filter((p: any) => p.amountCurrency > 0).map((p: any) => p.voucher?.id)
);
if (invoicePostingVoucherIds.size === 1 && invoicePostingVoucherIds.has(paymentVoucherId)) {
  console.error("Shared voucher — not a standalone payment reversal shape");
  process.exit(1);
}

// Step 2: Reverse the payment voucher
const reverseUrl = `${BASE}/ledger/voucher/${paymentVoucherId}/:reverse?date=2026-03-22`;
const r2 = await fetch(reverseUrl, { method: "PUT", headers: H });
if (!r2.ok) { console.error("PUT reverse failed:", r2.status, await r2.text()); process.exit(1); }
const data2 = await r2.json();
console.log("Reverse voucher created:", data2.value?.id);
console.log("Done. 2 API calls.");
