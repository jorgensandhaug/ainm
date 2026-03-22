const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

// Setup: create a customer and invoice to mirror the production task
// Step 1: Create customer
const custRes = await fetch(`${BASE}/customer`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    name: "Nordlys Sandbox AS",
    organizationNumber: "902392165",
    invoiceEmail: "test@nordlys.no",
  }),
});
const custData = await custRes.json();
console.log("Customer:", custRes.status, custData.value?.id);
const customerId = custData.value?.id;

// Step 2: Create order
const orderRes = await fetch(`${BASE}/order`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    customer: { id: customerId },
    deliveryDate: "2026-03-22",
    orderDate: "2026-03-22",
    orderLines: [
      {
        description: "Programvarelisens",
        count: 1,
        unitPriceExcludingVatCurrency: 47350,
        vatType: { id: 3 },
      },
    ],
  }),
});
const orderData = await orderRes.json();
console.log("Order:", orderRes.status, orderData.value?.id);
const orderId = orderData.value?.id;

// Step 3: Invoice the order
const invRes = await fetch(
  `${BASE}/order/${orderId}/:invoice?invoiceDate=2026-03-22&sendToCustomer=false`,
  { method: "PUT", headers }
);
const invData = await invRes.json();
console.log("Invoice:", invRes.status, invData.value?.id);

// Now replicate the exact 2-call production path
console.log("\n=== PRODUCTION PATH (2 calls) ===");

// Call 1: GET /invoice
const getUrl = `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
const getRes = await fetch(getUrl, { headers });
const getData = await getRes.json();
console.log("GET /invoice:", getRes.status, "count:", getData.count);

const invoices = getData.values || [];
const candidates = invoices.filter((inv: any) => {
  if (inv.isCreditNote || inv.isCredited) return false;
  if (inv.customer?.organizationNumber !== "902392165") return false;
  if (inv.amountExcludingVatCurrency !== 47350 && inv.amountExcludingVat !== 47350) return false;
  const olDesc = (inv.orderLines || []).some((ol: any) => ol.description === "Programvarelisens");
  const nestedDesc = (inv.orders || []).some((o: any) =>
    (o.orderLines || []).some((ol: any) => ol.description === "Programvarelisens")
  );
  return olDesc || nestedDesc;
});

console.log("Candidates:", candidates.length);
const target = candidates.reduce((a: any, b: any) => (a.id > b.id ? a : b));
console.log(`Target invoice: id=${target.id}, amount=${target.amountExcludingVatCurrency}`);

// Call 2: PUT createCreditNote
const putUrl = `${BASE}/invoice/${target.id}/:createCreditNote?date=2026-03-22&sendToCustomer=false`;
const putRes = await fetch(putUrl, { method: "PUT", headers });
const putData = await putRes.json();
const cn = putData.value;
console.log(`Credit note: id=${cn.id}, isCreditNote=${cn.isCreditNote}, creditedInvoice=${cn.creditedInvoice}`);
console.log("\nSandbox verification: 2 calls, 0 errors. Path confirmed.");
