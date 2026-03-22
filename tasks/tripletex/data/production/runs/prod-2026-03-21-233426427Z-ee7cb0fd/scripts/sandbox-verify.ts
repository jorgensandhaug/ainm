const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: Create a customer matching the production task shape
const custRes = await fetch(`${BASE}/customer`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    name: "Lysgård AS",
    organizationNumber: "866100829",
    invoiceEmail: "faktura@lysgaard.no",
  }),
});
if (!custRes.ok) { console.error("POST /customer failed:", custRes.status, await custRes.text()); process.exit(1); }
const cust = (await custRes.json()).value;
console.log("Created customer:", cust.id, cust.name);

// Step 2: Create an order with the matching line
const orderRes = await fetch(`${BASE}/order`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    customer: { id: cust.id },
    deliveryDate: "2026-03-22",
    orderDate: "2026-03-22",
    orderLines: [
      {
        description: "Webdesign",
        count: 1,
        unitPriceExcludingVatCurrency: 9900,
        vatType: { id: 6 },
      },
    ],
  }),
});
if (!orderRes.ok) { console.error("POST /order failed:", orderRes.status, await orderRes.text()); process.exit(1); }
const order = (await orderRes.json()).value;
console.log("Created order:", order.id);

// Step 3: Create invoice from order
const invRes = await fetch(`${BASE}/order/${order.id}/:invoice?invoiceDate=2026-03-22&sendToCustomer=false`, {
  method: "PUT",
  headers: H,
});
if (!invRes.ok) { console.error("PUT /order/:invoice failed:", invRes.status, await invRes.text()); process.exit(1); }
const inv = (await invRes.json()).value;
console.log("Created invoice:", inv.id, "amount excl VAT:", inv.amountExcludingVatCurrency);

// Step 4: Now do the exact two-call production path
console.log("\n--- Production two-call path ---");

// Call 1: Locate
const searchUrl = `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
const searchRes = await fetch(searchUrl, { headers: H });
if (!searchRes.ok) { console.error("GET /invoice failed:", searchRes.status, await searchRes.text()); process.exit(1); }
const searchData = await searchRes.json();
const invoices = searchData.values || [];

const match = invoices.filter((i: any) => {
  if (i.isCreditNote || i.isCredited) return false;
  const orgMatch = i.customer?.organizationNumber === "866100829";
  if (!orgMatch) return false;
  const amountMatch = i.amountExcludingVatCurrency === 9900;
  if (!amountMatch) return false;
  const olDesc = (i.orderLines || []).some((ol: any) => ol.description === "Webdesign");
  const nestedDesc = (i.orders || []).some((o: any) => (o.orderLines || []).some((ol: any) => ol.description === "Webdesign"));
  return olDesc || nestedDesc;
});

console.log("Matching invoices:", match.length);
if (match.length !== 1) { console.error("Expected 1 match"); process.exit(1); }
const targetId = match[0].id;
console.log("Target invoice id:", targetId);

// Call 2: Create credit note
const creditUrl = `${BASE}/invoice/${targetId}/:createCreditNote?date=2026-03-22&sendToCustomer=false`;
const creditRes = await fetch(creditUrl, { method: "PUT", headers: H });
if (!creditRes.ok) { console.error("PUT createCreditNote failed:", creditRes.status, await creditRes.text()); process.exit(1); }
const creditData = await creditRes.json();
const cn = creditData.value;
console.log("Credit note created:");
console.log("  id:", cn.id);
console.log("  invoiceNumber:", cn.invoiceNumber);
console.log("  isCreditNote:", cn.isCreditNote);
console.log("  creditedInvoice:", cn.creditedInvoice);
console.log("  amountExcludingVatCurrency:", cn.amountExcludingVatCurrency);
console.log("\nSandbox verification PASSED: two-call path works for organizationNumber=866100829, description='Webdesign', amountExcludingVatCurrency=9900");
