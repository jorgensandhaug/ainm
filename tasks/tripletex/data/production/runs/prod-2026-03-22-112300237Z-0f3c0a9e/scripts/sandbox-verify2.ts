// Sandbox verification using direct invoice ID (bypassing sandbox search lag)
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

// Use invoice created in previous script: 2147700114
const invoiceId = 2147700114;

// Get the invoice with postings to find payment voucher
const locateRes = await api("GET", `/invoice/${invoiceId}?fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`);
console.log("Invoice status:", locateRes.status);
const inv = locateRes.data.value;
console.log("Invoice:", inv?.id, "amountExcludingVatCurrency:", inv?.amountExcludingVatCurrency, "outstanding:", inv?.amountCurrencyOutstanding, "amountCurrency:", inv?.amountCurrency);

const postings = inv?.postings || [];
console.log("Postings count:", postings.length);
postings.forEach((p: any) => {
  console.log(`  posting: type=${p.type}, amount=${p.amountCurrency}, desc=${p.description}, voucherId=${p.voucher?.id}, account=${p.account?.number}`);
});

// Extract payment voucher using fallback matcher (type=null, negative amount, "Betaling:" description)
let paymentPostings = postings.filter((p: any) => p.amountCurrency < 0 && p.description?.includes("Betaling:"));
if (paymentPostings.length === 0) {
  paymentPostings = postings.filter((p: any) => p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE");
}

const invoiceVoucherIds = new Set(postings.filter((p: any) =>
  p.type === "OUTGOING_INVOICE_CUSTOMER_POSTING" || p.type === "OUTGOING_INVOICE_DEBT_POSTING"
).map((p: any) => p.voucher?.id));

let paymentVoucherIds = [...new Set(paymentPostings.map((p: any) => p.voucher?.id).filter(Boolean))];
const standalone = paymentVoucherIds.filter(id => !invoiceVoucherIds.has(id));
if (standalone.length > 0) paymentVoucherIds = standalone;

console.log("Payment voucher ID:", paymentVoucherIds[0]);
const pvId = paymentVoucherIds[0];

// Reverse
const reverseRes = await api("PUT", `/ledger/voucher/${pvId}/:reverse?date=2026-03-22`);
console.log("Reverse status:", reverseRes.status);
console.log("Reverse voucher ID:", reverseRes.data.value?.id);

// Verify
const verifyRes = await api("GET", `/invoice/${invoiceId}?fields=*,postings(*,voucher(*))`);
console.log("After reverse - outstanding:", verifyRes.data.value?.amountCurrencyOutstanding);
console.log("After reverse - amountCurrency:", verifyRes.data.value?.amountCurrency);
console.log("Match:", verifyRes.data.value?.amountCurrencyOutstanding === verifyRes.data.value?.amountCurrency ? "YES" : "NO");

console.log("\n=== SANDBOX VERIFICATION COMPLETE ===");
