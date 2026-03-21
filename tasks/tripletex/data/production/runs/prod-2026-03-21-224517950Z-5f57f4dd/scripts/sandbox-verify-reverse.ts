const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json();
  if (res.status >= 400) console.log(`ERROR ${res.status} ${path}:`, JSON.stringify(data).slice(0, 200));
  return { status: res.status, data };
}

const UID = Date.now();

// Setup: create fixtures
const { data: cust } = await api("POST", "/customer", { name: `Étoile SB ${UID}` });
const custId = cust.value.id;
console.log("Customer:", custId);

const { data: prod } = await api("POST", "/product", { name: `Conseil ${UID}`, priceExcludingVatCurrency: 33900, priceIncludingVatCurrency: 33900 });
const prodId = prod.value.id;
console.log("Product:", prodId);

const { data: order } = await api("POST", "/order", {
  customer: { id: custId },
  deliveryDate: "2026-03-21",
  orderDate: "2026-03-21",
  orderLines: [{ product: { id: prodId }, count: 1 }]
});
const orderId = order.value.id;
console.log("Order:", orderId);

const { data: inv } = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false`);
const invoiceId = inv.value.id;
console.log("Invoice:", invoiceId);

// Get payment type
const { data: ptData } = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
const payType = (ptData.values || []).find((pt: any) => String(pt.debitAccount?.number || "").startsWith("192"));
console.log("Payment type:", payType?.id, payType?.debitAccount?.number);

// Get invoice amount
const { data: invDetail } = await api("GET", `/invoice/${invoiceId}?fields=*`);
const outstanding = invDetail.value.amountCurrencyOutstanding;
console.log("Outstanding:", outstanding);

// Pay invoice
const { data: payData } = await api("PUT", `/invoice/${invoiceId}/:payment?paymentDate=2026-03-21&paymentTypeId=${payType.id}&paidAmount=${outstanding}`);
console.log("Paid, remaining:", payData.value?.remainingOutstandingAmountCurrency);

// ===== 2-CALL REVERSE =====
console.log("\n=== 2-call reverse ===");

// Call 1: locate
const { data: locData } = await api("GET", "/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=1000&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))");
console.log("Locate count:", locData.count);

const target = (locData.values || []).find((i: any) => i.id === invoiceId);
if (!target) { console.log("NOT FOUND in broad search"); process.exit(1); }
console.log("Found invoice:", target.id, "outstanding:", target.amountCurrencyOutstanding);

const postings = target.postings || [];
for (const p of postings) {
  console.log(`  type=${p.type} amt=${p.amountCurrency} desc="${(p.description||"").slice(0,60)}" voucher=${p.voucher?.id} acct=${p.account?.number||"null"}`);
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

// Call 2: reverse
const { data: revData, status: revStatus } = await api("PUT", `/ledger/voucher/${vId}/:reverse?date=2026-03-21`);
console.log("Reverse:", revStatus, "new voucher:", revData.value?.id);

// Proof (not scored)
const { data: verData } = await api("GET", `/invoice/${invoiceId}?fields=*`);
console.log("\nPost-reversal outstanding:", verData.value?.amountCurrencyOutstanding, "expected:", outstanding);
console.log("PASS:", verData.value?.amountCurrencyOutstanding === outstanding);
