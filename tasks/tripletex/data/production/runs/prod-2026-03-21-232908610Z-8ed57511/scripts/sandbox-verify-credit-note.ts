// Sandbox verification: create a fixture invoice matching the production prompt shape
// then credit it using the same two-call path
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 0: Create a fixture customer + order + invoice to mirror the production shape
// Find or create customer with org number similar to production
const custRes = await fetch(`${BASE}/customer?organizationNumber=978503071&fields=id,name,organizationNumber`, { headers: H });
const custData = await custRes.json();
console.log("Customer search:", custRes.status, "count:", custData.count);

let customerId: number;
if (custData.count > 0) {
  customerId = custData.values[0].id;
  console.log("Using existing customer:", customerId);
} else {
  // Create customer
  const newCust = await fetch(`${BASE}/customer`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ name: "Viento SL Sandbox", organizationNumber: "978503071" })
  });
  const newCustData = await newCust.json();
  console.log("Created customer:", newCust.status, newCustData.value?.id);
  customerId = newCustData.value.id;
}

// Create order with line "Licencia de software" 25450
const orderRes = await fetch(`${BASE}/order`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    customer: { id: customerId },
    deliveryDate: "2026-03-15",
    orderDate: "2026-03-15",
    orderLines: [{ description: "Licencia de software", count: 1, unitPriceExcludingVatCurrency: 25450, vatType: { id: 3 } }]
  })
});
const orderData = await orderRes.json();
console.log("Created order:", orderRes.status, orderData.value?.id);
const orderId = orderData.value.id;

// Invoice the order
const invRes = await fetch(`${BASE}/order/${orderId}/:invoice?invoiceDate=2026-03-15&sendToCustomer=false`, {
  method: "PUT",
  headers: H
});
const invData = await invRes.json();
console.log("Invoiced order:", invRes.status, invData.value?.id);
const invoiceId = invData.value.id;

// === Now test the production two-call path ===
console.log("\n--- Testing production two-call path ---");

// Call 1: Locate invoice
const locateUrl = `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
const locateRes2 = await fetch(locateUrl, { headers: H });
const locateData2 = await locateRes2.json();
console.log("Locate status:", locateRes2.status, "count:", locateData2.count);

// Filter
const invoices = (locateData2.values || []).filter((inv: any) => {
  if (inv.isCreditNote || inv.isCredited) return false;
  if (inv.customer?.organizationNumber !== "978503071") return false;
  if (inv.amountExcludingVatCurrency !== 25450 && inv.amountExcludingVat !== 25450) return false;
  const desc = "Licencia de software";
  const topMatch = (inv.orderLines || []).some((l: any) => l.description === desc);
  const nestedMatch = (inv.orders || []).some((o: any) =>
    (o.orderLines || []).some((l: any) => l.description === desc)
  );
  return topMatch || nestedMatch;
});

console.log("Matching invoices:", invoices.length);
if (invoices.length < 1) {
  console.error("No match found!");
  process.exit(1);
}

// Use the first match (should be the one we just created)
const targetId = invoices[0].id;
console.log("Target invoice id:", targetId);

// Call 2: Create credit note
const creditUrl = `${BASE}/invoice/${targetId}/:createCreditNote?date=2026-03-22&sendToCustomer=false`;
const creditRes2 = await fetch(creditUrl, { method: "PUT", headers: H });
const creditData2 = await creditRes2.json();
console.log("Credit note status:", creditRes2.status);

if (creditRes2.status >= 400) {
  console.error("Credit note failed:", JSON.stringify(creditData2));
  process.exit(1);
}

const cn = creditData2.value;
console.log("Credit note id:", cn.id);
console.log("Credit note number:", cn.invoiceNumber);
console.log("isCreditNote:", cn.isCreditNote);
console.log("creditedInvoice:", cn.creditedInvoice);
console.log("amountExcludingVatCurrency:", cn.amountExcludingVatCurrency);
console.log("\nSandbox verification PASSED — 2-call path works for Spanish 'Licencia de software' prompt shape.");
