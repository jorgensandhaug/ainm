const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(method, path);
  const opts: any = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) { console.error("ERROR", res.status, text.slice(0, 300)); process.exit(1); }
  try { return JSON.parse(text); } catch { return text; }
}

const ts = Date.now();

// Create customer
const custRes = await api("POST", "/customer", {
  name: `Vestfjord Test ${ts}`,
  organizationNumber: String(800000000 + Math.floor(Math.random() * 99999999)),
  customerNumber: 90000 + Math.floor(Math.random() * 9000),
});
const customerId = custRes?.value?.id;
const custOrgNr = custRes?.value?.organizationNumber;
console.log("Customer:", customerId, "orgNr:", custOrgNr);

// Create product - no vatType (uses default)
const prodRes = await api("POST", "/product", {
  name: `Systemutvikling ${ts}`,
  priceExcludingVatCurrency: 46850,
});
const productId = prodRes?.value?.id;
const productVatId = prodRes?.value?.vatType?.id;
console.log("Product:", productId, "vatType:", productVatId);

// Create order
const orderRes = await api("POST", "/order", {
  customer: { id: customerId },
  deliveryDate: "2026-03-21",
  orderDate: "2026-03-21",
  orderLines: [{ product: { id: productId }, count: 1 }],
});
const orderId = orderRes?.value?.id;
console.log("Order:", orderId);

// Invoice the order
const invoiceRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false`);
const invoiceId = invoiceRes?.value?.id;
const invoiceAmount = invoiceRes?.value?.amountCurrency;
console.log("Invoice:", invoiceId, "amount:", invoiceAmount);

// Pay the invoice
const payRes = await api("PUT", `/invoice/${invoiceId}/:payment?paymentDate=2026-03-21&paymentTypeId=32813748&paidAmount=${invoiceAmount}`);
console.log("Paid invoice:", payRes?.value?.id);

// === 2-CALL REVERSAL PATH ===
console.log("\n=== SCORED CALLS BELOW ===");

// Call 1: Locate
const locateRes = await api("GET", `/invoice?customerOrgNumber=${custOrgNr}&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`);
let invoices = locateRes?.values || [];
console.log("Found invoices:", invoices.length);

// Handle sandbox search lag
if (invoices.length === 0) {
  console.log("Sandbox search lag - using direct GET (sandbox only, not needed in production)");
  const directRes = await api("GET", `/invoice/${invoiceId}?fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`);
  invoices = [directRes?.value];
}

const inv = invoices[0];
console.log("Invoice id:", inv.id, "amountExcludingVatCurrency:", inv.amountExcludingVatCurrency, "amountCurrency:", inv.amountCurrency, "outstanding:", inv.amountCurrencyOutstanding);

// Extract payment voucher
const postings: any[] = inv.postings || [];
let payPostings = postings.filter((p: any) =>
  p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE"
);
if (payPostings.length === 0) {
  payPostings = postings.filter((p: any) =>
    p.amountCurrency < 0 && p.description?.startsWith("Betaling:") && (p.type === null || p.type === undefined)
  );
}
console.log("Payment postings:", payPostings.length);
for (const p of payPostings) {
  console.log("  amount:", p.amountCurrency, "voucher:", p.voucher?.id, "type:", p.type, "account:", p.account?.number, "desc:", p.description);
}

const pvId = payPostings[0]?.voucher?.id;

// Call 2: Reverse
const revRes = await api("PUT", `/ledger/voucher/${pvId}/:reverse?date=2026-03-21`);
console.log("Reverse voucher:", revRes?.value?.id);
console.log("=== 2 SCORED CALLS DONE ===\n");

// Verification (not scored)
const proofRes = await api("GET", `/invoice/${invoiceId}?fields=*`);
console.log("After reversal - outstanding:", proofRes?.value?.amountCurrencyOutstanding, "expected:", inv.amountCurrency);
console.log("Match:", proofRes?.value?.amountCurrencyOutstanding === inv.amountCurrency);
console.log("\nDone.");
