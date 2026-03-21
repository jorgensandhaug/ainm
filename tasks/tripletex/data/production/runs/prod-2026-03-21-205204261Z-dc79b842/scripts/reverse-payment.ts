const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "qTw7wIxxkwD6zcdQJ6uQbsL8BJ517kiDE5KiD9-MwcY";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: Decisive GET to locate the paid invoice for Sierra SL (910318144), ex-VAT 19250
const invoiceUrl = `${BASE}/invoice?customerOrgNumber=910318144&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`;
console.log("GET", invoiceUrl);
const r1 = await fetch(invoiceUrl, { headers });
if (!r1.ok) { console.error("GET invoice failed:", r1.status, await r1.text()); process.exit(1); }
const data1 = await r1.json();
console.log("Invoice count:", data1.count);

const invoices = data1.values as any[];
// Local filter on ex-VAT amount
const target = invoices.length === 1
  ? invoices[0]
  : invoices.find((inv: any) => inv.amountExcludingVatCurrency === 19250);

if (!target) { console.error("No invoice found matching ex-VAT 19250"); process.exit(1); }
console.log("Target invoice id:", target.id, "amountCurrency:", target.amountCurrency, "amountExcludingVatCurrency:", target.amountExcludingVatCurrency);

// Extract payment voucher: unique negative Betaling posting (type may be null)
const postings = target.postings as any[];
const invoiceVoucherIds = new Set(
  postings.filter((p: any) => p.description && !p.description.startsWith("Betaling:")).map((p: any) => p.voucher?.id)
);
const paymentPostings = postings.filter((p: any) => {
  if (p.amountCurrency >= 0) return false;
  if (p.description && p.description.startsWith("Betaling:")) return true;
  if (p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE") return true;
  return false;
});

// Deduplicate by voucher id
const paymentVoucherIds = [...new Set(paymentPostings.map((p: any) => p.voucher?.id).filter(Boolean))];
if (paymentVoucherIds.length !== 1) {
  console.error("Expected exactly 1 payment voucher, found:", paymentVoucherIds);
  // Fallback: unique voucher from negative postings not shared with invoice posting voucher
  const negPostings = postings.filter((p: any) => p.amountCurrency < 0);
  const negVoucherIds = [...new Set(negPostings.map((p: any) => p.voucher?.id).filter(Boolean))];
  const standalone = negVoucherIds.filter(id => !invoiceVoucherIds.has(id));
  if (standalone.length === 1) {
    console.log("Fallback: using standalone negative voucher:", standalone[0]);
    paymentVoucherIds.length = 0;
    paymentVoucherIds.push(standalone[0]);
  } else {
    process.exit(1);
  }
}

const paymentVoucherId = paymentVoucherIds[0];
console.log("Payment voucher id:", paymentVoucherId);

// Step 2: Reverse the payment voucher
const reverseUrl = `${BASE}/ledger/voucher/${paymentVoucherId}/:reverse?date=2026-03-21`;
console.log("PUT", reverseUrl);
const r2 = await fetch(reverseUrl, { method: "PUT", headers });
if (!r2.ok) { console.error("PUT reverse failed:", r2.status, await r2.text()); process.exit(1); }
const data2 = await r2.json();
console.log("Reverse voucher id:", data2.value?.id);
console.log("Done. Payment reversed successfully.");
