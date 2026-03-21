// Sandbox verification: create fixture, then verify the two-call credit note path
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const customerId = 108440520; // just created

// Create an order - need to check correct payload shape
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
        vatType: { id: 3 },
      },
    ],
  }),
});
const orderData = await orderRes.json();
console.log("Order:", orderRes.status, JSON.stringify(orderData).substring(0, 500));

if (!orderRes.ok) {
  // Try without vatType
  const orderRes2 = await fetch(`${BASE}/order`, {
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
        },
      ],
    }),
  });
  const orderData2 = await orderRes2.json();
  console.log("Order attempt 2:", orderRes2.status, JSON.stringify(orderData2).substring(0, 500));
}
