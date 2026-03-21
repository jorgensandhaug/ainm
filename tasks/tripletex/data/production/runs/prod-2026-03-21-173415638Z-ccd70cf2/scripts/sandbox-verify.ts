// Sandbox verification: create a paid invoice fixture and prove the 2-call reversal path
// Also test with multiple invoices for the same customer to validate local filtering

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const d = await r.json();
  console.log(`  Status: ${r.status}`);
  if (r.status >= 400) {
    console.log(`  Error: ${JSON.stringify(d).slice(0, 500)}`);
  }
  return { status: r.status, data: d };
}

// Step 1: Create customer
const ts = Date.now();
const { data: custData } = await api("POST", "/customer", {
  name: `Sandbox MultiInv Customer ${ts}`,
  organizationNumber: String(100000000 + Math.floor(Math.random() * 900000000)),
  isCustomer: true,
});
const customerId = custData.value.id;
const orgNumber = custData.value.organizationNumber;
console.log(`Customer ID: ${customerId}, Org: ${orgNumber}`);

// Step 2: Create product
const { data: prodData } = await api("POST", "/product", {
  name: `Skylagring ${ts}`,
  priceExcludingVatCurrency: 17200,
});
const productId = prodData.value.id;
console.log(`Product ID: ${productId}`);

// Step 3: Create a second product (different amount)
const { data: prod2Data } = await api("POST", "/product", {
  name: `Annen Tjeneste ${ts}`,
  priceExcludingVatCurrency: 5000,
});
const product2Id = prod2Data.value.id;
console.log(`Product 2 ID: ${product2Id}`);

// Step 4: Create first order (the one we'll reverse)
const { data: ord1Data } = await api("POST", "/order", {
  customer: { id: customerId },
  deliveryDate: "2026-03-21",
  orderDate: "2026-03-21",
  orderLines: [{ product: { id: productId }, count: 1 }],
});
const order1Id = ord1Data.value.id;
console.log(`Order 1 ID: ${order1Id}`);

// Step 5: Create second order (different invoice, same customer)
const { data: ord2Data } = await api("POST", "/order", {
  customer: { id: customerId },
  deliveryDate: "2026-03-21",
  orderDate: "2026-03-21",
  orderLines: [{ product: { id: product2Id }, count: 1 }],
});
const order2Id = ord2Data.value.id;
console.log(`Order 2 ID: ${order2Id}`);

// Step 6: Get payment types
const { data: ptData } = await api("GET", "/invoice/paymentType");
const paymentTypes = ptData.values || [];
console.log(`Payment types: ${paymentTypes.map((pt: any) => `${pt.id}:${pt.description}`).join(", ")}`);
const paymentTypeId = paymentTypes[0]?.id;

// Step 7: Invoice both orders and pay both
const { data: inv1Data } = await api("PUT", `/order/${order1Id}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false`);
const invoice1Id = inv1Data.value.id;
console.log(`Invoice 1 ID: ${invoice1Id}`);

const { data: inv2Data } = await api("PUT", `/order/${order2Id}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false`);
const invoice2Id = inv2Data.value.id;
console.log(`Invoice 2 ID: ${invoice2Id}`);

// Pay both invoices
const { data: pay1 } = await api("PUT", `/invoice/${invoice1Id}/:payment?paymentDate=2026-03-21&paymentTypeId=${paymentTypeId}&paidAmount=${17200 * 1.25}`);
console.log(`Payment 1 registered`);

const { data: pay2 } = await api("PUT", `/invoice/${invoice2Id}/:payment?paymentDate=2026-03-21&paymentTypeId=${paymentTypeId}&paidAmount=${5000 * 1.25}`);
console.log(`Payment 2 registered`);

// Step 8: Now prove the 2-call reversal path with multiple invoices
console.log("\n=== PROVING 2-CALL PATH WITH MULTI-INVOICE FILTER ===\n");

// Call 1: Locate invoice
const { data: locateData } = await api("GET", `/invoice?customerOrgNumber=${orgNumber}&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`);
console.log(`Found ${locateData.count} invoices for org ${orgNumber}`);

// Filter locally by ex-VAT amount 17200
const invoices = locateData.values || [];
const target = invoices.filter((inv: any) =>
  inv.amountExcludingVatCurrency === 17200
);
console.log(`Filtered to ${target.length} invoice(s) with amountExcludingVatCurrency=17200`);

if (target.length !== 1) {
  console.error("Filter did not isolate exactly 1 invoice");
  process.exit(1);
}

const invoice = target[0];
console.log(`Target invoice ID: ${invoice.id}, amountExcludingVatCurrency: ${invoice.amountExcludingVatCurrency}`);

// Extract payment voucher
const postings = invoice.postings || [];
let paymentVoucherId: number | null = null;

// Try typed postings first
const typedPayment = postings.filter((p: any) =>
  p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE"
);
if (typedPayment.length > 0) {
  const vids = [...new Set(typedPayment.map((p: any) => p.voucher?.id).filter(Boolean))];
  if (vids.length === 1) paymentVoucherId = vids[0] as number;
}

// Fallback: unique negative Betaling posting
if (!paymentVoucherId) {
  const betalingPostings = postings.filter((p: any) =>
    p.amountCurrency < 0 && p.description?.startsWith("Betaling:")
  );
  const vids = [...new Set(betalingPostings.map((p: any) => p.voucher?.id).filter(Boolean))];
  const invoiceVoucherIds = [...new Set(
    postings.filter((p: any) => p.amountCurrency > 0).map((p: any) => p.voucher?.id).filter(Boolean)
  )];
  const standalone = vids.filter((id: any) => !invoiceVoucherIds.includes(id));
  if (standalone.length === 1) paymentVoucherId = standalone[0] as number;
}

console.log(`Payment voucher ID: ${paymentVoucherId}`);

if (!paymentVoucherId) {
  console.error("Could not extract payment voucher");
  console.log("Postings:", JSON.stringify(postings.map((p: any) => ({
    type: p.type, desc: p.description, amt: p.amountCurrency, vid: p.voucher?.id, acc: p.account?.number
  })), null, 2));
  process.exit(1);
}

// Call 2: Reverse
const { data: reverseData, status: reverseStatus } = await api("PUT", `/ledger/voucher/${paymentVoucherId}/:reverse?date=2026-03-21`);
console.log(`Reverse voucher ID: ${reverseData.value?.id}`);

if (reverseStatus >= 400) {
  console.error("Reverse failed");
  process.exit(1);
}

// Verification (not part of the 2-call path, just for sandbox proof)
console.log("\n=== VERIFICATION (optional, not scored) ===\n");
const { data: verifyData } = await api("GET", `/invoice/${invoice.id}?fields=*,postings(*,voucher(*))`);
console.log(`Outstanding after reversal: ${verifyData.value?.amountCurrencyOutstanding}`);
console.log(`Expected outstanding: ${invoice.amountCurrency}`);

console.log("\n=== SANDBOX PROOF COMPLETE ===");
console.log(`2-call path confirmed with multi-invoice customer (${locateData.count} invoices, local filter isolated 1)`);
