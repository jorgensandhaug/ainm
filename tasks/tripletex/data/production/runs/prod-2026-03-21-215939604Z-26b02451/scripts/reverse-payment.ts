const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "jYRAdMeGElRhTSNHDGs653U1bhyX8GXhpLDhTBYBUi8";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const h = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: Find the invoice for Windkraft GmbH (823566441) with ex-VAT 29500
const invoiceUrl = `${BASE}/invoice?customerOrgNumber=823566441&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`;

const r1 = await fetch(invoiceUrl, { headers: h });
const d1 = await r1.json();
console.log("Invoice search status:", r1.status, "count:", d1.count);

if (!r1.ok || !d1.values?.length) {
  console.error("No invoices found", JSON.stringify(d1).slice(0, 500));
  process.exit(1);
}

// Filter by ex-VAT amount if multiple invoices
let invoice = d1.values[0];
if (d1.values.length > 1) {
  const match = d1.values.filter((v: any) => v.amountExcludingVatCurrency === 29500);
  if (match.length !== 1) {
    console.error("Cannot isolate invoice by ex-VAT 29500, found", match.length);
    process.exit(1);
  }
  invoice = match[0];
}

console.log("Invoice id:", invoice.id, "amountCurrency:", invoice.amountCurrency, "amountExcludingVatCurrency:", invoice.amountExcludingVatCurrency);

// Extract payment voucher: unique negative Betaling posting (type may be null)
const postings = invoice.postings || [];
const paymentPostings = postings.filter((p: any) =>
  (p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE") ||
  (p.amountCurrency < 0 && p.description && p.description.startsWith("Betaling:"))
);

// Deduplicate by voucher id
const voucherIds = [...new Set(paymentPostings.map((p: any) => p.voucher?.id).filter(Boolean))];

// Also check: if all postings point to the same voucher (shared voucher trap), bail
const allVoucherIds = [...new Set(postings.map((p: any) => p.voucher?.id).filter(Boolean))];
if (allVoucherIds.length === 1) {
  // Check if the invoice posting and payment posting share the same voucher
  const invoicePostings = postings.filter((p: any) => p.amountCurrency > 0);
  const invoiceVouchers = [...new Set(invoicePostings.map((p: any) => p.voucher?.id).filter(Boolean))];
  if (invoiceVouchers.length === 1 && invoiceVouchers[0] === allVoucherIds[0]) {
    console.error("Shared voucher trap - all postings on same voucher, not a standalone payment reversal");
    process.exit(1);
  }
}

if (voucherIds.length !== 1) {
  console.error("Expected exactly 1 payment voucher, found", voucherIds.length, JSON.stringify(paymentPostings.map((p: any) => ({ desc: p.description, amt: p.amountCurrency, voucherId: p.voucher?.id, type: p.type }))));
  process.exit(1);
}

const paymentVoucherId = voucherIds[0];
console.log("Payment voucher id:", paymentVoucherId);

// Step 2: Reverse the payment voucher
const reverseUrl = `${BASE}/ledger/voucher/${paymentVoucherId}/:reverse?date=2026-03-21`;
const r2 = await fetch(reverseUrl, { method: "PUT", headers: h });
const d2 = await r2.json();
console.log("Reverse status:", r2.status);
console.log("Reverse voucher:", JSON.stringify(d2).slice(0, 500));

if (!r2.ok) {
  console.error("Reverse failed");
  process.exit(1);
}

console.log("Done. Payment reversed successfully.");
