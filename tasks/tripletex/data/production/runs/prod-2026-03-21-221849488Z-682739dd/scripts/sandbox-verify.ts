// Sandbox verification: create a fixture invoice, then verify the two-call credit note path
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 0: Setup - find or create a customer with org number matching our test, then create an invoice
// First, find a customer we can use
const custRes = await fetch(`${BASE}/customer?organizationNumber=912435113&fields=*`, { headers: H });
const custData = await custRes.json();
console.log("Customer lookup:", custRes.status, "count:", custData.count);

let customerId: number;
if (custData.count > 0) {
  customerId = custData.values[0].id;
  console.log("Found existing customer id:", customerId);
} else {
  // Create a test customer
  const newCust = await fetch(`${BASE}/customer`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: "Nordlicht GmbH Test",
      organizationNumber: "912435113",
    }),
  });
  const newCustData = await newCust.json();
  customerId = newCustData.value.id;
  console.log("Created customer id:", customerId);
}

// Create an order with a line for "Webdesign" at 40550
const orderRes = await fetch(`${BASE}/order`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    customer: { id: customerId },
    deliveryDate: "2026-03-21",
    orderDate: "2026-03-21",
    orderLines: [
      {
        description: "Webdesign",
        count: 1,
        unitCostCurrency: 40550,
        vatType: { id: 3 }, // 25% MVA
      },
    ],
  }),
});
const orderData = await orderRes.json();
console.log("Order created:", orderRes.status, "id:", orderData.value?.id);

// Create invoice from order
const invRes = await fetch(`${BASE}/order/${orderData.value.id}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false`, {
  method: "PUT",
  headers: H,
});
const invData = await invRes.json();
console.log("Invoice created:", invRes.status, "id:", invData.value?.id, "invoiceNumber:", invData.value?.invoiceNumber);
const invoiceId = invData.value?.id;

// Now test the actual two-call path
console.log("\n=== TWO-CALL PATH TEST ===");

// Call 1: GET /invoice to locate
const getUrl = `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
const getRes = await fetch(getUrl, { headers: H });
const getData = await getRes.json();
console.log("GET /invoice:", getRes.status, "total invoices:", getData.count);

// Find the matching invoice
const target = (getData.values || []).find((inv: any) => {
  if (inv.isCreditNote || inv.isCredited) return false;
  const custMatch = inv.customer?.organizationNumber === "912435113";
  if (!custMatch) return false;
  const amountMatch = inv.amountExcludingVatCurrency === 40550;
  if (!amountMatch) return false;
  const olDesc = (inv.orderLines || []).some((ol: any) => ol.description === "Webdesign");
  const nestedDesc = (inv.orders || []).some((o: any) =>
    (o.orderLines || []).some((ol: any) => ol.description === "Webdesign")
  );
  return olDesc || nestedDesc;
});

if (!target) {
  console.error("No matching invoice found in sandbox!");
  process.exit(1);
}
console.log("Located invoice id:", target.id, "invoiceNumber:", target.invoiceNumber);

// Call 2: PUT createCreditNote
const creditUrl = `${BASE}/invoice/${target.id}/:createCreditNote?date=2026-03-21&sendToCustomer=false`;
const creditRes = await fetch(creditUrl, { method: "PUT", headers: H });
const creditData = await creditRes.json();
console.log("PUT createCreditNote:", creditRes.status);
console.log("  id:", creditData.value?.id);
console.log("  invoiceNumber:", creditData.value?.invoiceNumber);
console.log("  isCreditNote:", creditData.value?.isCreditNote);
console.log("  creditedInvoice:", creditData.value?.creditedInvoice);

if (creditData.value?.isCreditNote && creditData.value?.creditedInvoice === target.id) {
  console.log("\n✓ Two-call path verified in sandbox for organizationNumber=912435113, description='Webdesign', amountExcludingVatCurrency=40550");
} else {
  console.error("\n✗ Verification failed!");
}
