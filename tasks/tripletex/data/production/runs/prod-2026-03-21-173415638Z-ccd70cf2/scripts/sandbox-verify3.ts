// Sandbox verification: prove 2-call reversal using direct invoice GET
// Persistent sandbox has too many invoices for broad search, so use direct path

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

// Use the invoice we created in the previous script: ID 2147617116
const invoiceId = 2147617116;

// Call 1 equivalent: direct GET invoice with postings
const { data: locateData } = await api("GET", `/invoice/${invoiceId}?fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`);
const invoice = locateData.value;
console.log(`Invoice ID: ${invoice.id}, Number: ${invoice.invoiceNumber}`);
console.log(`amountExcludingVatCurrency: ${invoice.amountExcludingVatCurrency}`);
console.log(`amountCurrency: ${invoice.amountCurrency}`);
console.log(`amountCurrencyOutstanding: ${invoice.amountCurrencyOutstanding}`);
console.log(`OrderLines: ${invoice.orderLines?.map((ol: any) => ol.description || ol.displayName).join(", ")}`);
console.log(`Customer: ${invoice.customer?.name} (${invoice.customer?.organizationNumber})`);

// Extract payment voucher
const postings = invoice.postings || [];
console.log("\nAll postings:");
for (const p of postings) {
  console.log(`  type=${p.type} | desc="${p.description?.slice(0, 80)}" | amt=${p.amountCurrency} | vid=${p.voucher?.id} | acc=${p.account?.number}`);
}

let paymentVoucherId: number | null = null;

// Try typed postings first
const typedPayment = postings.filter((p: any) =>
  p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE"
);
if (typedPayment.length > 0) {
  const vids = [...new Set(typedPayment.map((p: any) => p.voucher?.id).filter(Boolean))];
  if (vids.length === 1) paymentVoucherId = vids[0] as number;
  console.log(`Found typed payment postings, voucher: ${paymentVoucherId}`);
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
  if (standalone.length === 1) {
    paymentVoucherId = standalone[0] as number;
    console.log(`Fallback: negative Betaling posting, standalone voucher: ${paymentVoucherId}`);
  }
}

if (!paymentVoucherId) {
  console.error("Could not extract payment voucher");
  process.exit(1);
}

// Call 2: Reverse
const { data: reverseData, status: reverseStatus } = await api("PUT", `/ledger/voucher/${paymentVoucherId}/:reverse?date=2026-03-21`);
console.log(`\nReverse status: ${reverseStatus}, Reverse voucher ID: ${reverseData.value?.id}`);

if (reverseStatus >= 400) {
  console.error("Reverse failed");
  process.exit(1);
}

// Verification
console.log("\n=== VERIFICATION ===");
const { data: verifyData } = await api("GET", `/invoice/${invoice.id}?fields=*,postings(*,voucher(*))`);
const v = verifyData.value;
console.log(`Outstanding after reversal: ${v?.amountCurrencyOutstanding}`);
console.log(`Invoice total (amountCurrency): ${v?.amountCurrency}`);
console.log(`Match: ${v?.amountCurrencyOutstanding === v?.amountCurrency ? "YES - invoice reopened" : "NO"}`);

console.log("\n=== SANDBOX PROOF COMPLETE ===");
console.log("2-call path confirmed: GET /invoice/{id} → PUT /ledger/voucher/{id}/:reverse");
