const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Create order with correct vatType
const orderRes = await fetch(`${BASE}/order`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    customer: { id: 108460598 },
    deliveryDate: "2026-03-15",
    orderDate: "2026-03-15",
    orderLines: [{ description: "Licencia de software", count: 1, unitPriceExcludingVatCurrency: 25450, vatType: { id: 3 } }]
  })
});
const orderData = await orderRes.json();
console.log("Order:", orderRes.status, JSON.stringify(orderData).slice(0, 500));
if (orderRes.status >= 400) {
  // Try without vatType
  const orderRes2 = await fetch(`${BASE}/order`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      customer: { id: 108460598 },
      deliveryDate: "2026-03-15",
      orderDate: "2026-03-15",
      orderLines: [{ description: "Licencia de software", count: 1, unitPriceExcludingVatCurrency: 25450 }]
    })
  });
  const orderData2 = await orderRes2.json();
  console.log("Order retry:", orderRes2.status, JSON.stringify(orderData2).slice(0, 500));
  if (orderRes2.status >= 400) process.exit(1);

  const orderId = orderData2.value.id;
  const invRes = await fetch(`${BASE}/order/${orderId}/:invoice?invoiceDate=2026-03-15&sendToCustomer=false`, {
    method: "PUT", headers: H
  });
  const invData = await invRes.json();
  console.log("Invoice:", invRes.status, invData.value?.id);

  // Now test the 2-call path
  await testTwoCallPath();
} else {
  const orderId = orderData.value.id;
  const invRes = await fetch(`${BASE}/order/${orderId}/:invoice?invoiceDate=2026-03-15&sendToCustomer=false`, {
    method: "PUT", headers: H
  });
  const invData = await invRes.json();
  console.log("Invoice:", invRes.status, invData.value?.id);
  await testTwoCallPath();
}

async function testTwoCallPath() {
  console.log("\n--- Testing production two-call path ---");

  const locateUrl = `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
  const locateRes = await fetch(locateUrl, { headers: H });
  const locateData = await locateRes.json();
  console.log("Locate:", locateRes.status, "count:", locateData.count);

  const invoices = (locateData.values || []).filter((inv: any) => {
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

  console.log("Matches:", invoices.length);
  if (invoices.length < 1) { console.error("No match!"); process.exit(1); }

  const targetId = invoices[0].id;
  console.log("Target:", targetId);

  const creditRes = await fetch(`${BASE}/invoice/${targetId}/:createCreditNote?date=2026-03-22&sendToCustomer=false`, {
    method: "PUT", headers: H
  });
  const creditData = await creditRes.json();
  console.log("Credit note:", creditRes.status);

  if (creditRes.status >= 400) {
    console.error("Failed:", JSON.stringify(creditData));
    process.exit(1);
  }

  const cn = creditData.value;
  console.log("CN id:", cn.id, "number:", cn.invoiceNumber);
  console.log("isCreditNote:", cn.isCreditNote);
  console.log("creditedInvoice:", cn.creditedInvoice);
  console.log("amount:", cn.amountExcludingVatCurrency);
  console.log("\nSandbox PASSED — 2-call path verified for Spanish prompt shape.");
}
