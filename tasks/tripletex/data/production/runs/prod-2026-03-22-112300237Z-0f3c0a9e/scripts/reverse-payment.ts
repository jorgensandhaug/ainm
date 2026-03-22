const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "LADIHKIs6tjaYXj9bLtuvactnCsc1LyutEFXklz_H_Y";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: Locate the paid invoice for Snøhetta AS (962427715), ex-VAT 49600, "Systemutvikling"
const invoiceUrl = `${BASE}/invoice?customerOrgNumber=962427715&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`;
const invoiceRes = await fetch(invoiceUrl, { headers: H });
const invoiceData = await invoiceRes.json();
console.log("Invoice search count:", invoiceData.count);

const invoices = invoiceData.values || [];
// Filter locally by ex-VAT amount
let target = invoices.filter((i: any) => i.amountExcludingVatCurrency === 49600);
if (target.length === 0) {
  target = invoices.filter((i: any) => i.amountExcludingVat === 49600);
}
if (target.length === 0) {
  console.log("No invoice with ex-VAT 49600 found. All invoices:", JSON.stringify(invoices.map((i: any) => ({ id: i.id, amountExcludingVatCurrency: i.amountExcludingVatCurrency, amountExcludingVat: i.amountExcludingVat })), null, 2));
  process.exit(1);
}
if (target.length > 1) {
  console.log("Multiple invoices with ex-VAT 49600, narrowing by orderLines description...");
  const narrowed = target.filter((i: any) => i.orderLines?.some((ol: any) => ol.description?.includes("Systemutvikling") || ol.displayName?.includes("Systemutvikling")));
  if (narrowed.length === 1) target = narrowed;
}

const invoice = target[0];
console.log("Target invoice:", invoice.id, "amountCurrency:", invoice.amountCurrency, "amountExcludingVatCurrency:", invoice.amountExcludingVatCurrency, "outstanding:", invoice.amountCurrencyOutstanding);

// Step 2: Extract payment voucher ID from postings
const postings = invoice.postings || [];

// Prefer INCOMING_PAYMENT typed postings
let paymentPostings = postings.filter((p: any) => p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE");

if (paymentPostings.length === 0) {
  // Fallback: unique negative payment-style posting with "Betaling:" description
  paymentPostings = postings.filter((p: any) => p.amountCurrency < 0 && p.description?.includes("Betaling:"));
}

if (paymentPostings.length === 0) {
  console.log("No payment postings found. All postings:", JSON.stringify(postings.map((p: any) => ({ type: p.type, amountCurrency: p.amountCurrency, description: p.description, voucherId: p.voucher?.id, account: p.account?.number })), null, 2));
  process.exit(1);
}

// Get unique voucher IDs from payment postings, excluding the invoice voucher
const invoiceVoucherIds = new Set(postings.filter((p: any) => p.type === "OUTGOING_INVOICE_CUSTOMER_POSTING" || p.type === "OUTGOING_INVOICE_DEBT_POSTING").map((p: any) => p.voucher?.id));
let paymentVoucherIds = [...new Set(paymentPostings.map((p: any) => p.voucher?.id).filter(Boolean))];
// Exclude shared invoice voucher IDs
const standalonePaymentVoucherIds = paymentVoucherIds.filter(id => !invoiceVoucherIds.has(id));
if (standalonePaymentVoucherIds.length > 0) {
  paymentVoucherIds = standalonePaymentVoucherIds;
}

if (paymentVoucherIds.length !== 1) {
  console.log("Expected exactly 1 payment voucher, found:", paymentVoucherIds);
  process.exit(1);
}

const paymentVoucherId = paymentVoucherIds[0];
console.log("Payment voucher ID:", paymentVoucherId);

// Step 3: Reverse the payment voucher
const reverseUrl = `${BASE}/ledger/voucher/${paymentVoucherId}/:reverse?date=2026-03-22`;
const reverseRes = await fetch(reverseUrl, { method: "PUT", headers: H });
const reverseData = await reverseRes.json();
console.log("Reverse status:", reverseRes.status);
console.log("Reverse voucher ID:", reverseData.value?.id);
console.log("Reverse voucher number:", reverseData.value?.number);

if (reverseRes.status >= 400) {
  console.log("Reverse failed:", JSON.stringify(reverseData, null, 2));
  process.exit(1);
}

console.log("Done. Payment reversed successfully.");
