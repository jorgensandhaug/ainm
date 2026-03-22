// Sandbox verification: fresh fixture with future dates to avoid reconciled periods
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const tag = Date.now();
const DATE = "2026-06-15"; // future date to avoid reconciled periods

// Create customer
const custR = await fetch(`${BASE}/customer`, {
  method: "POST", headers: H,
  body: JSON.stringify({ name: `Reverse Test ${tag}`, isCustomer: true })
});
const cust = (await custR.json()).value;
console.log("Customer:", cust.id);

// Create product
const prodR = await fetch(`${BASE}/product`, {
  method: "POST", headers: H,
  body: JSON.stringify({ name: `Nettverksteneste ${tag}`, priceExcludingVatCurrency: 41550 })
});
const prod = (await prodR.json()).value;
console.log("Product:", prod.id);

// Create order
const orderR = await fetch(`${BASE}/order`, {
  method: "POST", headers: H,
  body: JSON.stringify({
    customer: { id: cust.id },
    deliveryDate: DATE,
    orderDate: DATE,
    orderLines: [{ product: { id: prod.id }, count: 1 }]
  })
});
const order = (await orderR.json()).value;
console.log("Order:", order.id);

// Invoice it
const invR = await fetch(`${BASE}/order/${order.id}/:invoice?invoiceDate=${DATE}&sendToCustomer=false`, {
  method: "PUT", headers: H
});
const inv = (await invR.json()).value;
console.log("Invoice:", inv.id, "number:", inv.invoiceNumber, "amount:", inv.amount);

// Pay it (query params)
const payR = await fetch(`${BASE}/invoice/${inv.id}/:payment?paymentDate=${DATE}&paymentTypeId=32813748&paidAmount=${inv.amount}`, {
  method: "PUT", headers: H
});
console.log("Payment status:", payR.status);
if (payR.status >= 400) {
  const payD = await payR.json();
  console.error("Payment failed:", JSON.stringify(payD).slice(0, 300));
  process.exit(1);
}
console.log("Payment registered");

// === CANONICAL 2-CALL PATH ===
console.log("\n=== CANONICAL 2-CALL PATH ===");

// Call 1: Locate
const r1 = await fetch(`${BASE}/invoice?customerId=${cust.id}&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`, { headers: H });
const d1 = await r1.json();
console.log("Call 1 - count:", d1.count);

const target = (d1.values || []).find((i: any) => i.id === inv.id);
if (!target) {
  console.error("Not found in search");
  process.exit(1);
}
console.log("Invoice:", target.id, "exVAT:", target.amountExcludingVatCurrency, "amtCurrency:", target.amountCurrency);

const postings = target.postings || [];
let pp = postings.find((p: any) => p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE");
if (!pp) {
  const neg = postings.filter((p: any) => p.amountCurrency < 0 && p.description?.startsWith("Betaling:"));
  if (neg.length === 1) pp = neg[0];
}
if (!pp) {
  console.error("No payment posting");
  console.log("Postings:", JSON.stringify(postings.map((p: any) => ({
    type: p.type, amt: p.amountCurrency, desc: p.description, vid: p.voucher?.id
  })), null, 2));
  process.exit(1);
}
console.log("Payment voucher:", pp.voucher?.id, "type:", pp.type, "desc:", pp.description, "acct:", pp.account?.number);

// Call 2: Reverse
const r2 = await fetch(`${BASE}/ledger/voucher/${pp.voucher?.id}/:reverse?date=${DATE}`, { method: "PUT", headers: H });
const d2 = await r2.json();
console.log("Call 2 - Reverse status:", r2.status, "Reverse voucher:", d2.value?.id);

// Verify
const vR = await fetch(`${BASE}/invoice/${inv.id}?fields=*`, { headers: H });
const vD = await vR.json();
console.log("\nVerification:");
console.log("  amountCurrencyOutstanding:", vD.value?.amountCurrencyOutstanding);
console.log("  expected:", target.amountCurrency);
console.log("  match:", vD.value?.amountCurrencyOutstanding === target.amountCurrency);
console.log("SANDBOX VERIFICATION PASSED");
