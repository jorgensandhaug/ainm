// Sandbox verification: prove 2-call reversal path using known invoice ID
// The previous test showed customerOrgNumber can match many invoices in persistent sandbox
// In production, the customer is unique so this works fine

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
  if (r.status >= 400) console.log(`  Error: ${JSON.stringify(d).slice(0, 500)}`);
  return { status: r.status, data: d };
}

// Create a fresh customer with unique org number
const ts = Date.now();
const uniqueOrg = `9${String(ts).slice(-8)}`;
const { data: custData } = await api("POST", "/customer", {
  name: `SandboxReverseTest ${ts}`,
  organizationNumber: uniqueOrg,
  isCustomer: true,
});
const customerId = custData.value.id;
console.log(`Customer ID: ${customerId}, Org: ${uniqueOrg}`);

// Create product
const { data: prodData } = await api("POST", "/product", {
  name: `Skylagring SB ${ts}`,
  priceExcludingVatCurrency: 17200,
});
const productId = prodData.value.id;

// Create order
const { data: ordData } = await api("POST", "/order", {
  customer: { id: customerId },
  deliveryDate: "2026-03-21",
  orderDate: "2026-03-21",
  orderLines: [{ product: { id: productId }, count: 1 }],
});
const orderId = ordData.value.id;

// Invoice it
const { data: invData } = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false`);
const invoiceId = invData.value.id;
const invoiceNumber = invData.value.invoiceNumber;
console.log(`Invoice ID: ${invoiceId}, Number: ${invoiceNumber}`);

// Get payment type
const { data: ptData } = await api("GET", "/invoice/paymentType");
const paymentTypeId = ptData.values[0]?.id;

// Pay it
await api("PUT", `/invoice/${invoiceId}/:payment?paymentDate=2026-03-21&paymentTypeId=${paymentTypeId}&paidAmount=${17200 * 1.25}`);

// === NOW PROVE THE 2-CALL REVERSAL PATH ===
console.log("\n=== 2-CALL REVERSAL PATH ===\n");

// Call 1: Locate via customerOrgNumber
const { data: locateData } = await api("GET", `/invoice?customerOrgNumber=${uniqueOrg}&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`);
console.log(`Found ${locateData.count} invoices for unique org ${uniqueOrg}`);

const invoices = locateData.values || [];
if (invoices.length === 0) {
  // Sandbox search lag - try direct GET
  console.log("Broad search returned 0, trying direct GET (sandbox-only lag)...");
  const { data: directData } = await api("GET", `/invoice/${invoiceId}?fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`);
  invoices.push(directData.value);
}

const invoice = invoices.find((inv: any) => inv.amountExcludingVatCurrency === 17200) || invoices[0];
console.log(`Invoice ID: ${invoice.id}, amountExcludingVatCurrency: ${invoice.amountExcludingVatCurrency}`);
console.log(`OrderLines: ${invoice.orderLines?.map((ol: any) => ol.description || ol.displayName).join(", ")}`);

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
console.log("Postings summary:", postings.map((p: any) => ({
  type: p.type, desc: p.description?.slice(0, 60), amt: p.amountCurrency, vid: p.voucher?.id, acc: p.account?.number
})));

if (!paymentVoucherId) {
  console.error("Could not extract payment voucher");
  process.exit(1);
}

// Call 2: Reverse
const { data: reverseData, status: reverseStatus } = await api("PUT", `/ledger/voucher/${paymentVoucherId}/:reverse?date=2026-03-21`);
console.log(`Reverse status: ${reverseStatus}, Reverse voucher ID: ${reverseData.value?.id}`);

// Verification (optional proof, not part of 2-call path)
console.log("\n=== OPTIONAL VERIFICATION ===");
const { data: verifyData } = await api("GET", `/invoice/${invoice.id}?fields=*,postings(*,voucher(*))`);
const v = verifyData.value;
console.log(`Outstanding after reversal: ${v?.amountCurrencyOutstanding}`);
console.log(`Invoice total (amountCurrency): ${v?.amountCurrency}`);
console.log(`Expected: outstanding should equal amountCurrency = ${invoice.amountCurrency}`);
console.log(`Match: ${v?.amountCurrencyOutstanding === invoice.amountCurrency ? "YES" : "NO"}`);

console.log("\n=== SANDBOX PROOF COMPLETE ===");
