const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json();
  if (res.status >= 400) console.log(`ERROR ${res.status} ${path}:`, JSON.stringify(data).slice(0, 500));
  return { status: res.status, data };
}

// List all paid invoices with Betaling postings, pick last one (most recent)
const { data: invData } = await api("GET", "/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2030-12-31&count=1000&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))&sorting=invoiceDate");

const paidWithPayment = (invData.values || []).filter((inv: any) => {
  if (inv.amountCurrencyOutstanding !== 0 || inv.amountCurrency <= 0) return false;
  return (inv.postings || []).some((p: any) => (p.description||"").startsWith("Betaling:") && p.amountCurrency < 0);
});

console.log("Paid invoices with Betaling:", paidWithPayment.length);
for (const inv of paidWithPayment) {
  console.log(`  id=${inv.id} date=${inv.invoiceDate} amt=${inv.amountCurrency} customer=${inv.customer?.name?.slice(0,40)}`);
}

// Try the last one (most recent by date)
const target = paidWithPayment[paidWithPayment.length - 1];
if (!target) { console.log("None available"); process.exit(0); }

console.log("\nTrying:", target.id, target.invoiceDate, target.amountCurrency);
const postings = target.postings || [];
for (const p of postings) {
  console.log(`  type=${p.type} amt=${p.amountCurrency} desc="${(p.description||"").slice(0,80)}" voucher=${p.voucher?.id}`);
}

let vId: number | null = null;
const typed = postings.filter((p: any) => p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE");
if (typed.length > 0) {
  const vids = [...new Set(typed.map((p: any) => p.voucher?.id).filter(Boolean))];
  if (vids.length === 1) vId = vids[0] as number;
}
if (!vId) {
  const bet = postings.filter((p: any) => (p.description||"").startsWith("Betaling:") && p.amountCurrency < 0);
  const vids = [...new Set(bet.map((p: any) => p.voucher?.id).filter(Boolean))];
  const invVids = [...new Set(postings.filter((p: any) => !(p.description||"").startsWith("Betaling:")).map((p: any) => p.voucher?.id).filter(Boolean))];
  const payOnly = vids.filter((v: any) => !invVids.includes(v));
  vId = payOnly.length === 1 ? payOnly[0] as number : vids.length === 1 ? vids[0] as number : null;
}

console.log("Payment voucher:", vId);
const { data: revData, status: revStatus } = await api("PUT", `/ledger/voucher/${vId}/:reverse?date=2026-03-21`);
console.log("Reverse:", revStatus, "new voucher:", revData.value?.id);

if (revStatus === 200) {
  const { data: verData } = await api("GET", `/invoice/${target.id}?fields=*`);
  console.log("Post-reversal outstanding:", verData.value?.amountCurrencyOutstanding, "expected:", target.amountCurrency);
  console.log("PASS:", verData.value?.amountCurrencyOutstanding === target.amountCurrency);
}
