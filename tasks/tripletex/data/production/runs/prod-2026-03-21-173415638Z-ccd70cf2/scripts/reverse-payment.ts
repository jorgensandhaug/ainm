const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "HXsJyuiFKQZYwkrD6zy-XIO65wsC4TAmEjaqIV9Hzbc";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: Find the invoice for Polaris AS (896496468)
const invoiceUrl = `${BASE}/invoice?customerOrgNumber=896496468&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`;
console.log("GET", invoiceUrl);
const r1 = await fetch(invoiceUrl, { headers: H });
const d1 = await r1.json();
console.log("Status:", r1.status, "Count:", d1.count);

if (!d1.values || d1.values.length === 0) {
  console.error("No invoices found");
  process.exit(1);
}

// Filter by ex-VAT amount 17200 and description containing "Skylagring"
let invoices = d1.values;
if (invoices.length > 1) {
  const filtered = invoices.filter((inv: any) =>
    (inv.amountExcludingVatCurrency === 17200 || inv.amountExcludingVat === 17200) &&
    inv.orderLines?.some((ol: any) => ol.description?.includes("Skylagring") || ol.displayName?.includes("Skylagring"))
  );
  if (filtered.length === 1) invoices = filtered;
}

const invoice = invoices.length === 1 ? invoices[0] : (() => {
  // Try filtering by amount only
  const byAmt = invoices.filter((inv: any) =>
    inv.amountExcludingVatCurrency === 17200 || inv.amountExcludingVat === 17200
  );
  if (byAmt.length === 1) return byAmt[0];
  console.error("Cannot isolate invoice. Found:", invoices.length);
  process.exit(1);
})();

console.log("Invoice ID:", invoice.id, "Number:", invoice.invoiceNumber, "AmountExVat:", invoice.amountExcludingVatCurrency);

// Extract payment voucher from postings
const postings = invoice.postings || [];

// Look for INCOMING_PAYMENT typed postings first
let paymentPostings = postings.filter((p: any) =>
  p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE"
);

let paymentVoucherId: number | null = null;

if (paymentPostings.length > 0) {
  const voucherIds = [...new Set(paymentPostings.map((p: any) => p.voucher?.id).filter(Boolean))];
  if (voucherIds.length === 1) {
    paymentVoucherId = voucherIds[0] as number;
  }
}

// Fallback: unique negative Betaling posting
if (!paymentVoucherId) {
  const betalingPostings = postings.filter((p: any) =>
    p.amountCurrency < 0 && p.description?.startsWith("Betaling:")
  );
  const voucherIds = [...new Set(betalingPostings.map((p: any) => p.voucher?.id).filter(Boolean))];
  // Check this isn't the same voucher as the invoice posting
  const invoicePostingVoucherIds = [...new Set(
    postings.filter((p: any) => p.amountCurrency > 0).map((p: any) => p.voucher?.id).filter(Boolean)
  )];
  const standalonePaymentVouchers = voucherIds.filter((id: any) => !invoicePostingVoucherIds.includes(id));
  if (standalonePaymentVouchers.length === 1) {
    paymentVoucherId = standalonePaymentVouchers[0] as number;
  } else if (voucherIds.length === 1 && !invoicePostingVoucherIds.includes(voucherIds[0])) {
    paymentVoucherId = voucherIds[0] as number;
  } else if (voucherIds.length === 1) {
    // All postings share one voucher - not a standalone payment shape
    console.error("Shared voucher detected - not a standalone payment reversal shape");
    process.exit(1);
  }
}

if (!paymentVoucherId) {
  console.error("Could not extract payment voucher ID from postings");
  console.log("Postings:", JSON.stringify(postings, null, 2));
  process.exit(1);
}

console.log("Payment Voucher ID:", paymentVoucherId);

// Step 2: Reverse the payment voucher
const reverseUrl = `${BASE}/ledger/voucher/${paymentVoucherId}/:reverse?date=2026-03-21`;
console.log("PUT", reverseUrl);
const r2 = await fetch(reverseUrl, { method: "PUT", headers: H });
const d2 = await r2.json();
console.log("Reverse status:", r2.status);
console.log("Reverse voucher ID:", d2.value?.id);

if (r2.status >= 400) {
  console.error("Reverse failed:", JSON.stringify(d2));
  process.exit(1);
}

console.log("Done. Payment reversed successfully.");
