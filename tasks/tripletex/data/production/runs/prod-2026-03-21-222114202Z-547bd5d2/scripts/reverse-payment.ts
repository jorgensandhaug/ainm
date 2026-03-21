const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "wu1UzN5u26bXp9Bp8pvMWIfQync-uksCNUCM5TZsxbk";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const HEADERS = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: Locate the invoice for Polaris AS (896496468), ex-VAT 17200, "Skylagring"
const invoiceUrl = `${BASE}/invoice?customerOrgNumber=896496468&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`;
const invoiceResp = await fetch(invoiceUrl, { headers: HEADERS });
const invoiceData = await invoiceResp.json();
console.log("Invoice search count:", invoiceData.count);

const invoices = invoiceData.values;
// Filter by ex-VAT amount
const target = invoices.filter((inv: any) => inv.amountExcludingVatCurrency === 17200);
if (target.length !== 1) {
  console.error("Expected exactly 1 invoice with amountExcludingVatCurrency=17200, got", target.length);
  process.exit(1);
}
const invoice = target[0];
console.log("Invoice id:", invoice.id, "number:", invoice.invoiceNumber, "amountCurrency:", invoice.amountCurrency);

// Extract payment voucher: unique negative Betaling posting (type may be null)
const postings = invoice.postings || [];
const paymentPostings = postings.filter((p: any) =>
  p.amountCurrency < 0 && p.description && p.description.startsWith("Betaling:")
);
if (paymentPostings.length !== 1) {
  console.error("Expected exactly 1 payment posting, got", paymentPostings.length);
  process.exit(1);
}
const paymentVoucherId = paymentPostings[0].voucher.id;
console.log("Payment voucher id:", paymentVoucherId);

// Step 2: Reverse the payment voucher
const reverseUrl = `${BASE}/ledger/voucher/${paymentVoucherId}/:reverse?date=2026-03-21`;
const reverseResp = await fetch(reverseUrl, { method: "PUT", headers: HEADERS });
const reverseData = await reverseResp.json();
console.log("Reverse status:", reverseResp.status);
console.log("Reverse voucher id:", reverseData.value?.id);
