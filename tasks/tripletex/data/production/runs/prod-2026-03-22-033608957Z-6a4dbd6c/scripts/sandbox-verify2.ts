const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) console.error(`${method} ${path} => ${res.status}`, JSON.stringify(data).slice(0, 300));
  return { status: res.status, data };
}

// Use the invoice we just created (528 / 2147671833), still unpaid
const invoiceId = 2147671833;
const invoiceAmount = 100;

// Get payment types
const { data: ptData } = await api("GET", "/invoice/paymentType?count=5&fields=id,description");
const ptId = ptData.values[0].id;
console.log("Payment type:", ptId, ptData.values[0].description);

// Pay via query params
const payPath = `/invoice/${invoiceId}/:payment?paymentDate=2026-03-22&paymentTypeId=${ptId}&paidAmount=${invoiceAmount}&paidAmountCurrency=${invoiceAmount}`;
const { data: payData, status: payStatus } = await api("PUT", payPath);
console.log("Payment status:", payStatus);

// Re-read invoice with postings
const { data: invData } = await api("GET", `/invoice/${invoiceId}?fields=*,customer(*),orderLines(*),postings(*,voucher(*),account(*))`);
const inv = invData.value;
console.log("\nInvoice:", inv.id, "amountCurrency:", inv.amountCurrency, "outstanding:", inv.amountCurrencyOutstanding);

// Extract payment voucher
const postings = inv.postings || [];
let paymentPosting = postings.find((p: any) => p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE");
if (!paymentPosting) {
  const negBetaling = postings.filter((p: any) => p.amountCurrency < 0 && p.description?.startsWith("Betaling:"));
  if (negBetaling.length === 1) paymentPosting = negBetaling[0];
}

if (!paymentPosting) {
  console.error("Could not find payment posting");
  console.log("Postings:", JSON.stringify(postings.map((p: any) => ({ type: p.type, desc: p.description, amt: p.amountCurrency, vid: p.voucher?.id, acct: p.account?.number })), null, 2));
  process.exit(1);
}

const pvId = paymentPosting.voucher?.id;
console.log("Payment voucher:", pvId, "type:", paymentPosting.type, "amount:", paymentPosting.amountCurrency, "acct:", paymentPosting.account?.number);

// Reverse the payment — the 2-call production path
const { data: revData, status: revStatus } = await api("PUT", `/ledger/voucher/${pvId}/:reverse?date=2026-03-22`);
console.log("\nReverse status:", revStatus);
console.log("Reverse voucher:", revData.value?.id);

// Verify outstanding reopened
const { data: verData } = await api("GET", `/invoice/${invoiceId}?fields=*,postings(*,voucher(*))`);
console.log("After reversal - outstanding:", verData.value.amountCurrencyOutstanding, "expected:", inv.amountCurrency);
console.log("SUCCESS:", verData.value.amountCurrencyOutstanding === inv.amountCurrency);
