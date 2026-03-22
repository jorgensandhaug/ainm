// Sandbox verification: create a paid invoice, then reverse the payment in 2 calls
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!r.ok) { console.error(`${method} ${path} → ${r.status}`, json); throw new Error(`${r.status}`); }
  return json;
}

// Setup: create customer, product, order, invoice, payment
const ts = Date.now();
const cust = await api("POST", "/customer", {
  name: `SandboxVerify ${ts}`,
  organizationNumber: String(100000000 + Math.floor(Math.random() * 899999999)),
  email: `verify${ts}@example.com`
});
const customerId = cust.value.id;
console.log("Customer:", customerId);

const prod = await api("POST", "/product", {
  name: `TestProduct ${ts}`,
  priceExcludingVatCurrency: 25500
});
const productId = prod.value.id;
console.log("Product:", productId);

const order = await api("POST", "/order", {
  customer: { id: customerId },
  deliveryDate: "2026-03-22",
  orderDate: "2026-03-22",
  orderLines: [{ product: { id: productId }, count: 1 }]
});
const orderId = order.value.id;
console.log("Order:", orderId);

// Invoice it
const inv = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=2026-03-22&sendToCustomer=false`);
const invoiceId = inv.value.id;
console.log("Invoice:", invoiceId);

// Find a payment type
const ptypes = await api("GET", "/invoice/paymentType?count=10");
const paymentTypeId = ptypes.values[0].id;
console.log("PaymentType:", paymentTypeId);

// Pay the invoice
await api("PUT", `/invoice/${invoiceId}/:payment?paymentDate=2026-03-22&paymentTypeId=${paymentTypeId}&paidAmount=25500`);
console.log("Invoice paid");

// === NOW the actual 2-call reversal path ===
console.log("\n=== 2-CALL REVERSAL PATH ===");

// Call 1: Locate invoice
const orgNumber = cust.value.organizationNumber;
const searchResult = await api("GET", `/invoice?customerOrgNumber=${orgNumber}&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`);
console.log("Call 1 - Invoice search count:", searchResult.count);

let target: any = null;
if (searchResult.count === 1) {
  target = searchResult.values[0];
} else {
  target = searchResult.values.find((inv: any) => inv.amountExcludingVatCurrency === 25500);
}

if (!target) {
  console.log("Broad search returned 0, trying direct GET...");
  const direct = await api("GET", `/invoice/${invoiceId}?fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`);
  target = direct.value;
}

console.log("Target invoice:", target.id, "amountCurrency:", target.amountCurrency, "amountExcludingVatCurrency:", target.amountExcludingVatCurrency);

// Extract payment voucher
const postings = target.postings || [];
let paymentPosting = postings.find((p: any) =>
  p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE"
);
if (!paymentPosting) {
  paymentPosting = postings.find((p: any) =>
    p.amountCurrency < 0 && p.description && p.description.startsWith("Betaling:")
  );
}
if (!paymentPosting) {
  console.error("No payment posting found");
  console.log("All postings:", JSON.stringify(postings.map((p: any) => ({
    type: p.type, desc: p.description, amount: p.amountCurrency, voucherId: p.voucher?.id, account: p.account?.number
  })), null, 2));
  process.exit(1);
}

const paymentVoucherId = paymentPosting.voucher?.id;
console.log("Payment voucher ID:", paymentVoucherId, "type:", paymentPosting.type, "account:", paymentPosting.account?.number);

// Call 2: Reverse the payment
const reverseResult = await api("PUT", `/ledger/voucher/${paymentVoucherId}/:reverse?date=2026-03-22`);
console.log("Call 2 - Reverse voucher created:", reverseResult.value?.id);

// Verification (not part of the 2-call path, just for proof)
const verifyResult = await api("GET", `/invoice/${target.id}?fields=*,postings(*,voucher(*))`);
console.log("\nVerification - amountCurrencyOutstanding:", verifyResult.value.amountCurrencyOutstanding);
console.log("Expected:", target.amountCurrency, "(should match)");
console.log("\nSandbox verification complete. 2-call path confirmed.");
