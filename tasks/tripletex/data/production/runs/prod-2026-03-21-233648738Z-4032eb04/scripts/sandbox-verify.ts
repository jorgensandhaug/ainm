const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: Create fixture customer (Brückentor GmbH / 901668566)
const custRes = await fetch(`${BASE}/customer`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    name: "Brückentor GmbH",
    organizationNumber: "901668566",
    email: "info@brueckentor.de",
    invoiceEmail: "invoice@brueckentor.de",
  }),
});
if (!custRes.ok) {
  console.error("POST /customer failed:", custRes.status, await custRes.text());
  process.exit(1);
}
const cust = await custRes.json();
const customerId = cust.value.id;
console.log("Created customer:", customerId);

// Step 2: Create order with line matching "Webdesign" / 38800
const orderRes = await fetch(`${BASE}/order`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    customer: { id: customerId },
    deliveryDate: "2026-03-22",
    orderDate: "2026-03-22",
    orderLines: [
      {
        description: "Webdesign",
        count: 1,
        unitPriceExcludingVatCurrency: 38800,
      },
    ],
  }),
});
if (!orderRes.ok) {
  console.error("POST /order failed:", orderRes.status, await orderRes.text());
  process.exit(1);
}
const order = await orderRes.json();
const orderId = order.value.id;
console.log("Created order:", orderId);

// Step 3: Create invoice from order
const invRes = await fetch(`${BASE}/invoice?sendToCustomer=false`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    invoiceDate: "2026-03-22",
    invoiceDueDate: "2026-04-22",
    orders: [{ id: orderId }],
  }),
});
if (!invRes.ok) {
  console.error("POST /invoice failed:", invRes.status, await invRes.text());
  process.exit(1);
}
const inv = await invRes.json();
const invoiceId = inv.value.id;
console.log("Created invoice:", invoiceId, "amount:", inv.value.amountExcludingVatCurrency);

// === Now verify the two-call production path ===

// Call 1: Decisive GET /invoice
console.log("\n=== PRODUCTION PATH VERIFICATION ===");
const getUrl =
  `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23` +
  `&count=1000&sorting=-invoiceDate` +
  `&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;

const res1 = await fetch(getUrl, { headers: H });
if (!res1.ok) {
  console.error("GET /invoice failed:", res1.status, await res1.text());
  process.exit(1);
}
const data = await res1.json();
const invoices = data.values || [];
console.log("Call 1 (GET /invoice): returned", invoices.length, "invoices");

// Find the invoice for 901668566, "Webdesign", 38800
const target = invoices.find((inv: any) => {
  if (inv.isCreditNote || inv.isCredited) return false;
  if (inv.customer?.organizationNumber !== "901668566") return false;
  if (inv.amountExcludingVatCurrency !== 38800) return false;
  const olMatch = inv.orderLines?.some((ol: any) => ol.description === "Webdesign");
  const oolMatch = inv.orders?.some((o: any) =>
    o.orderLines?.some((ol: any) => ol.description === "Webdesign")
  );
  return olMatch || oolMatch;
});

if (!target) {
  console.error("No matching invoice found in locate step");
  process.exit(1);
}
console.log("Located invoice:", target.id, "number:", target.invoiceNumber);

// Call 2: PUT createCreditNote
const putUrl = `${BASE}/invoice/${target.id}/:createCreditNote?date=2026-03-22&sendToCustomer=false`;
const res2 = await fetch(putUrl, { method: "PUT", headers: H });
if (!res2.ok) {
  console.error("PUT createCreditNote failed:", res2.status, await res2.text());
  process.exit(1);
}
const cn = await res2.json();
const v = cn.value;
console.log("Call 2 (PUT createCreditNote):");
console.log("  credit note id:", v.id);
console.log("  invoiceNumber:", v.invoiceNumber);
console.log("  isCreditNote:", v.isCreditNote);
console.log("  creditedInvoice:", v.creditedInvoice);
console.log("  amountExcludingVatCurrency:", v.amountExcludingVatCurrency);

// Verify
if (v.isCreditNote !== true) {
  console.error("FAIL: isCreditNote is not true");
  process.exit(1);
}
if (v.creditedInvoice !== target.id) {
  console.error("FAIL: creditedInvoice does not match original");
  process.exit(1);
}
console.log("\n=== SANDBOX VERIFICATION PASSED ===");
console.log("Two-call path confirmed for organizationNumber=901668566, description='Webdesign', amountExcludingVatCurrency=38800 (German prompt)");
