// Sandbox verification: create a paid invoice, then reverse the payment using the canonical 2-call path
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json();
  return { status: res.status, data: json };
}

// Setup: create fixture objects
const tag = Date.now();

// 1. Create customer
const custRes = await api("POST", "/customer", { name: `SandboxReverseTest ${tag}`, organizationNumber: "962427715", isCustomer: true });
console.log("Customer:", custRes.status, custRes.data.value?.id);
const customerId = custRes.data.value?.id;

// 2. Create product
const prodRes = await api("POST", "/product", { name: `Systemutvikling ${tag}`, priceExcludingVatCurrency: 49600 });
console.log("Product:", prodRes.status, prodRes.data.value?.id);
const productId = prodRes.data.value?.id;

// 3. Create order
const orderRes = await api("POST", "/order", {
  customer: { id: customerId },
  deliveryDate: "2026-03-22",
  orderDate: "2026-03-22",
  orderLines: [{ product: { id: productId }, count: 1 }]
});
console.log("Order:", orderRes.status, orderRes.data.value?.id);
const orderId = orderRes.data.value?.id;

// 4. Invoice the order
const invoiceRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=2026-03-22&sendToCustomer=false`);
console.log("Invoice:", invoiceRes.status, invoiceRes.data.value?.id);
const invoiceId = invoiceRes.data.value?.id;

// 5. Get payment types
const ptRes = await api("GET", "/invoice/paymentType?count=10");
const paymentTypes = ptRes.data.values || [];
const paymentType = paymentTypes[0];
console.log("PaymentType:", paymentType?.id, paymentType?.description);

// 6. Pay the invoice
const payRes = await api("PUT", `/invoice/${invoiceId}/:payment?paymentDate=2026-03-22&paymentTypeId=${paymentType.id}&paidAmount=49600&paidAmountCurrency=49600`);
console.log("Payment:", payRes.status);

// === Now test the canonical 2-call path ===
console.log("\n=== CANONICAL 2-CALL PATH ===");

// Call 1: Locate invoice
const locateRes = await api("GET", `/invoice?customerOrgNumber=962427715&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`);
console.log("Locate count:", locateRes.data.count);
const invoices = locateRes.data.values || [];

// Filter by ex-VAT amount
const target = invoices.filter((i: any) => i.amountExcludingVatCurrency === 49600);
console.log("Filtered invoices:", target.length);

if (target.length === 0) {
  console.log("ERROR: No invoice found with ex-VAT 49600");
  console.log("All invoices:", JSON.stringify(invoices.map((i: any) => ({ id: i.id, amountExcludingVatCurrency: i.amountExcludingVatCurrency })), null, 2));
  process.exit(1);
}

const inv = target[0];
console.log("Target invoice:", inv.id, "outstanding:", inv.amountCurrencyOutstanding);

// Extract payment voucher
const postings = inv.postings || [];
let paymentPostings = postings.filter((p: any) => p.amountCurrency < 0 && p.description?.includes("Betaling:"));
if (paymentPostings.length === 0) {
  paymentPostings = postings.filter((p: any) => p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE");
}

const invoiceVoucherIds = new Set(postings.filter((p: any) => p.type === "OUTGOING_INVOICE_CUSTOMER_POSTING" || p.type === "OUTGOING_INVOICE_DEBT_POSTING").map((p: any) => p.voucher?.id));
let paymentVoucherIds = [...new Set(paymentPostings.map((p: any) => p.voucher?.id).filter(Boolean))];
const standalone = paymentVoucherIds.filter(id => !invoiceVoucherIds.has(id));
if (standalone.length > 0) paymentVoucherIds = standalone;

console.log("Payment voucher IDs:", paymentVoucherIds);
const pvId = paymentVoucherIds[0];

// Call 2: Reverse
const reverseRes = await api("PUT", `/ledger/voucher/${pvId}/:reverse?date=2026-03-22`);
console.log("Reverse status:", reverseRes.status);
console.log("Reverse voucher ID:", reverseRes.data.value?.id);

// Verification GET (free)
const verifyRes = await api("GET", `/invoice/${inv.id}?fields=*,postings(*,voucher(*))`);
console.log("After reverse - outstanding:", verifyRes.data.value?.amountCurrencyOutstanding);
console.log("After reverse - amountCurrency:", verifyRes.data.value?.amountCurrency);

console.log("\n=== SANDBOX VERIFICATION COMPLETE ===");
console.log("2-call path confirmed: 1 GET locate + 1 PUT reverse");
