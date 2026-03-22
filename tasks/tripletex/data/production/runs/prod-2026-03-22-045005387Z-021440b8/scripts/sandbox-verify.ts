const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };
const TODAY = "2026-03-22";

// --- SETUP: Create customer + order + invoice matching the prod prompt shape ---

// 1. Create customer with org nr 871338140
const custRes = await fetch(`${BASE}/customer`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    name: "Estrella SL",
    organizationNumber: "871338140",
    isCustomer: true,
  }),
});
const cust = await custRes.json();
console.log("Customer:", custRes.status, cust.value?.id, cust.value?.name);
const custId = cust.value?.id;
if (!custId) { console.error("Customer creation failed"); process.exit(1); }

// 2. Create order with line "Diseño web" 39850
const orderRes = await fetch(`${BASE}/order`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    customer: { id: custId },
    deliveryDate: TODAY,
    orderDate: TODAY,
    orderLines: [
      {
        description: "Diseño web",
        count: 1,
        unitCostCurrency: 39850,
        unitPriceExcludingVatCurrency: 39850,
        vatType: { id: 3 }, // 25% MVA
      },
    ],
  }),
});
const order = await orderRes.json();
console.log("Order:", orderRes.status, order.value?.id);
const orderId = order.value?.id;
if (!orderId) { console.error("Order creation failed", JSON.stringify(order)); process.exit(1); }

// 3. Create invoice from order
const invRes = await fetch(`${BASE}/invoice?sendToCustomer=false`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    invoiceDate: TODAY,
    invoiceDueDate: "2026-04-22",
    orders: [{ id: orderId }],
  }),
});
const inv = await invRes.json();
console.log("Invoice:", invRes.status, inv.value?.id, "amount:", inv.value?.amountExcludingVatCurrency);
const invoiceId = inv.value?.id;
if (!invoiceId) { console.error("Invoice creation failed", JSON.stringify(inv)); process.exit(1); }

console.log("\n--- SETUP COMPLETE. Now running the 2-call production path ---\n");

// --- PRODUCTION PATH: exactly 2 calls ---

// Call 1: GET /invoice with full fields
const getUrl = `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
const res1 = await fetch(getUrl, { headers: H });
const data = await res1.json();
const invoices = data.values || [];

// Filter to match prod prompt shape
const matches = invoices.filter((inv: any) => {
  if (inv.isCreditNote || inv.isCredited) return false;
  if (inv.customer?.organizationNumber !== "871338140") return false;
  if (inv.amountExcludingVatCurrency !== 39850) return false;
  const descs: string[] = [];
  for (const ol of (inv.orderLines || [])) descs.push(ol.description || "");
  for (const o of (inv.orders || [])) for (const ol of (o.orderLines || [])) descs.push(ol.description || "");
  return descs.some((d: string) => d === "Diseño web");
});

console.log("GET /invoice:", res1.status, "total invoices:", invoices.length, "matches:", matches.length);

if (matches.length === 0) { console.error("No matching invoice found in sandbox"); process.exit(1); }

const target = matches.reduce((a: any, b: any) => (a.id > b.id ? a : b));
console.log("Target invoice id:", target.id, "amount:", target.amountExcludingVatCurrency);

// Call 2: PUT createCreditNote
const putUrl = `${BASE}/invoice/${target.id}/:createCreditNote?date=${TODAY}&sendToCustomer=false`;
const res2 = await fetch(putUrl, { method: "PUT", headers: H });
const cn = await res2.json();
console.log("PUT createCreditNote:", res2.status);
console.log("Credit note id:", cn.value?.id, "isCreditNote:", cn.value?.isCreditNote, "creditedInvoice:", cn.value?.creditedInvoice);
console.log("\n--- SANDBOX VERIFICATION COMPLETE: 2-call path confirmed ---");
