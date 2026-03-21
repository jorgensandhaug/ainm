// Sandbox verification using direct invoice ID (avoiding known sandbox search lag)
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

const ts = Date.now();

// Setup: create customer, product, order, invoice, pay
const custR = await fetch(`${BASE}/customer`, { method: "POST", headers, body: JSON.stringify({ name: `MontañaSL ${ts}`, organizationNumber: "888412972" }) });
const custJ = await custR.json();
if (!custR.ok) { console.error("Cust fail:", custJ); process.exit(1); }
const cust = custJ.value;
console.log("Customer:", cust.id);

const prodR = await fetch(`${BASE}/product`, { method: "POST", headers, body: JSON.stringify({ name: `Diseño web ${ts}`, priceExcludingVatCurrency: 35800 }) });
const prod = (await prodR.json()).value;
console.log("Product:", prod.id);

const orderR = await fetch(`${BASE}/order`, { method: "POST", headers, body: JSON.stringify({ customer: { id: cust.id }, deliveryDate: "2026-03-21", orderDate: "2026-03-21", orderLines: [{ product: { id: prod.id }, count: 1 }] }) });
const order = (await orderR.json()).value;
console.log("Order:", order.id);

const invR = await fetch(`${BASE}/order/${order.id}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false`, { method: "PUT", headers });
const inv = (await invR.json()).value;
console.log("Invoice:", inv.id, "num:", inv.invoiceNumber, "amountCurrency:", inv.amountCurrency, "amountExcludingVatCurrency:", inv.amountExcludingVatCurrency);

// Get payment types and pay
const ptR = await fetch(`${BASE}/invoice/paymentType?count=5&fields=id,description`, { headers });
const pts = (await ptR.json()).values;
const paymentTypeId = pts.find((p: any) => p.description === "Betalt til bank")?.id || pts[0].id;

const payR = await fetch(`${BASE}/invoice/${inv.id}/:payment?paymentDate=2026-03-21&paymentTypeId=${paymentTypeId}&paidAmount=${inv.amountCurrency}`, { method: "PUT", headers });
console.log("Payment status:", payR.status);
await payR.json();

// === 2-CALL PRODUCTION PATH (using direct invoice ID since we know it) ===
console.log("\n=== 2-CALL PATH VERIFICATION ===");

// Call 1: Direct GET invoice with all expansions
const r1 = await fetch(`${BASE}/invoice/${inv.id}?fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`, { headers });
const d1 = (await r1.json()).value;
console.log("Invoice amountCurrencyOutstanding:", d1.amountCurrencyOutstanding);
console.log("Invoice amountExcludingVatCurrency:", d1.amountExcludingVatCurrency);

const postings = d1.postings as any[];
console.log("\nAll postings:");
postings.forEach((p: any) => console.log(`  desc="${p.description}" amount=${p.amountCurrency} type=${p.type} voucherId=${p.voucher?.id} account=${p.account?.number}`));

// Find payment posting via fallback matcher
const payPostings = postings.filter((p: any) => p.amountCurrency < 0 && p.description?.startsWith("Betaling:"));
console.log("\nPayment postings found:", payPostings.length);
if (payPostings.length !== 1) { console.error("Expected 1 payment posting"); process.exit(1); }

const pvId = payPostings[0].voucher.id;
console.log("Payment voucher id:", pvId);

// Call 2: Reverse
const r2 = await fetch(`${BASE}/ledger/voucher/${pvId}/:reverse?date=2026-03-21`, { method: "PUT", headers });
const d2 = await r2.json();
console.log("Reverse status:", r2.status);
console.log("Reverse voucher id:", d2.value?.id);

// Proof (not part of 2-call path)
const vR = await fetch(`${BASE}/invoice/${inv.id}?fields=*,postings(*,voucher(*))`, { headers });
const vD = (await vR.json()).value;
console.log("\nAfter reversal:");
console.log("  amountCurrencyOutstanding:", vD.amountCurrencyOutstanding);
console.log("  amountCurrency:", vD.amountCurrency);
console.log("  SUCCESS:", vD.amountCurrencyOutstanding === vD.amountCurrency);
