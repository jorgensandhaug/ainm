const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "mvcytSAOBjhBEoak3s0sS8qxIvBdC_RsSukBq2-Bb3w";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: Locate the paid invoice for Vestfjord AS (805747536), "Systemutvikling", 46850 excl. VAT
const invoiceUrl = `${BASE}/invoice?customerOrgNumber=805747536&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`;

console.log("GET", invoiceUrl);
const invoiceRes = await fetch(invoiceUrl, { headers });
if (!invoiceRes.ok) {
  console.error("Invoice search failed:", invoiceRes.status, await invoiceRes.text());
  process.exit(1);
}

const invoiceData = await invoiceRes.json();
console.log("Invoice count:", invoiceData.count);

let invoices = invoiceData.values;

// If multiple invoices, filter by ex-VAT amount
if (invoices.length > 1) {
  const filtered = invoices.filter((inv: any) => inv.amountExcludingVatCurrency === 46850);
  if (filtered.length === 1) {
    invoices = filtered;
    console.log("Filtered to 1 invoice by amountExcludingVatCurrency=46850");
  } else {
    console.error("Could not isolate invoice. Filtered count:", filtered.length);
    process.exit(1);
  }
}

if (invoices.length === 0) {
  console.error("No invoices found for customer org 805747536");
  process.exit(1);
}

const invoice = invoices[0];
console.log("Invoice id:", invoice.id, "number:", invoice.invoiceNumber);
console.log("amountCurrency:", invoice.amountCurrency, "amountCurrencyOutstanding:", invoice.amountCurrencyOutstanding);
console.log("amountExcludingVatCurrency:", invoice.amountExcludingVatCurrency);

// Extract payment voucher from postings
// Look for INCOMING_PAYMENT / INCOMING_PAYMENT_OPPOSITE typed postings first
const postings: any[] = invoice.postings || [];
let paymentPostings = postings.filter((p: any) =>
  p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE"
);

// Fallback: unique negative Betaling posting with type=null
if (paymentPostings.length === 0) {
  paymentPostings = postings.filter((p: any) =>
    p.amountCurrency < 0 &&
    p.description?.startsWith("Betaling:") &&
    (p.type === null || p.type === undefined)
  );
}

console.log("Payment postings found:", paymentPostings.length);
for (const p of paymentPostings) {
  console.log("  posting id:", p.id, "amount:", p.amountCurrency, "voucher:", p.voucher?.id, "type:", p.type, "desc:", p.description);
}

// Get unique payment voucher ids
const paymentVoucherIds = [...new Set(paymentPostings.map((p: any) => p.voucher?.id).filter(Boolean))];
console.log("Unique payment voucher ids:", paymentVoucherIds);

if (paymentVoucherIds.length !== 1) {
  console.error("Expected exactly 1 payment voucher, got", paymentVoucherIds.length);
  process.exit(1);
}

// Check: if ALL postings (invoice + payment) share the same single voucher, this is a combined shape — do not reverse
const allVoucherIds = [...new Set(postings.map((p: any) => p.voucher?.id).filter(Boolean))];
if (allVoucherIds.length === 1 && allVoucherIds[0] === paymentVoucherIds[0]) {
  console.error("All postings share one voucher — combined prepayment shape, cannot use this standard");
  process.exit(1);
}

const paymentVoucherId = paymentVoucherIds[0];
console.log("Payment voucher to reverse:", paymentVoucherId);

// Step 2: Reverse the payment voucher
const reverseUrl = `${BASE}/ledger/voucher/${paymentVoucherId}/:reverse?date=2026-03-21`;
console.log("PUT", reverseUrl);
const reverseRes = await fetch(reverseUrl, { method: "PUT", headers });
if (!reverseRes.ok) {
  console.error("Reverse failed:", reverseRes.status, await reverseRes.text());
  process.exit(1);
}

const reverseData = await reverseRes.json();
console.log("Reverse voucher created, id:", reverseData.value?.id, "number:", reverseData.value?.number);
console.log("Done — payment reversed, invoice should show outstanding balance again.");
