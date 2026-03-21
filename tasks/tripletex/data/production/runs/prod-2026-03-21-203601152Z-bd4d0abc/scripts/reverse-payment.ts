const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "1BuXF8epktYZEgsY34Y8F0VacXyUoF0Pusrw5CbZBqY";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: Locate the invoice for Montaña SL (888412972) with postings
const invoiceUrl = `${BASE}/invoice?customerOrgNumber=888412972&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`;
console.log("GET", invoiceUrl);
const r1 = await fetch(invoiceUrl, { headers });
if (!r1.ok) { console.error("GET /invoice failed", r1.status, await r1.text()); process.exit(1); }
const data1 = await r1.json();
console.log("Invoice count:", data1.count);

const invoices = data1.values as any[];
// Filter by ex-VAT amount 35800
const target = invoices.filter((inv: any) => inv.amountExcludingVatCurrency === 35800);
if (target.length !== 1) {
  console.error("Expected 1 invoice with amountExcludingVatCurrency=35800, found", target.length);
  console.log("All invoices amountExcludingVatCurrency:", invoices.map((i: any) => i.amountExcludingVatCurrency));
  process.exit(1);
}
const invoice = target[0];
console.log("Invoice id:", invoice.id, "invoiceNumber:", invoice.invoiceNumber, "amountCurrency:", invoice.amountCurrency, "amountCurrencyOutstanding:", invoice.amountCurrencyOutstanding);

// Extract payment voucher: unique negative Betaling posting (type may be null)
const postings = invoice.postings as any[];
const paymentPostings = postings.filter((p: any) =>
  p.amountCurrency < 0 && p.description && p.description.startsWith("Betaling:")
);
if (paymentPostings.length !== 1) {
  console.error("Expected 1 payment posting, found", paymentPostings.length);
  postings.forEach((p: any) => console.log("  posting:", p.description, p.amountCurrency, "voucher:", p.voucher?.id, "type:", p.type));
  process.exit(1);
}
const paymentVoucherId = paymentPostings[0].voucher.id;
console.log("Payment voucher id:", paymentVoucherId);

// Step 2: Reverse the payment voucher
const reverseUrl = `${BASE}/ledger/voucher/${paymentVoucherId}/:reverse?date=2026-03-21`;
console.log("PUT", reverseUrl);
const r2 = await fetch(reverseUrl, { method: "PUT", headers });
if (!r2.ok) { console.error("PUT reverse failed", r2.status, await r2.text()); process.exit(1); }
const data2 = await r2.json();
console.log("Reverse voucher id:", data2.value?.id);
console.log("Done. Payment reversed.");
