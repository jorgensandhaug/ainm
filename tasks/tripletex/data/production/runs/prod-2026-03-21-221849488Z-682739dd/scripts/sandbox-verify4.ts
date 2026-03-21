// Fix: use unitPriceExcludingVatCurrency, not unitCostCurrency
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const customerId = 108440520;

// Create order with correct price field
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
        unitPriceExcludingVatCurrency: 40550,
      },
    ],
  }),
});
const orderData = await orderRes.json();
if (!orderRes.ok) {
  console.error("Order failed:", JSON.stringify(orderData));
  process.exit(1);
}
const orderId = orderData.value.id;
console.log("Order created:", orderId);

// Invoice the order
const invRes = await fetch(`${BASE}/order/${orderId}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false`, {
  method: "PUT",
  headers: H,
});
const invData = await invRes.json();
if (!invRes.ok) {
  console.error("Invoice failed:", JSON.stringify(invData));
  process.exit(1);
}
console.log("Invoice created id:", invData.value.id, "amount:", invData.value.amountExcludingVatCurrency);

// === TWO-CALL PATH ===
console.log("\n=== TWO-CALL CREDIT NOTE PATH ===");

// Call 1: Locate
const getUrl = `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
const getRes = await fetch(getUrl, { headers: H });
const getData = await getRes.json();

const target = (getData.values || []).find((inv: any) => {
  if (inv.isCreditNote || inv.isCredited) return false;
  if (inv.customer?.organizationNumber !== "912435113") return false;
  if (inv.amountExcludingVatCurrency !== 40550) return false;
  const olDesc = (inv.orderLines || []).some((ol: any) => ol.description === "Webdesign");
  const nestedDesc = (inv.orders || []).some((o: any) =>
    (o.orderLines || []).some((ol: any) => ol.description === "Webdesign")
  );
  return olDesc || nestedDesc;
});

if (!target) {
  console.error("Locate failed! Looking for 912435113 / Webdesign / 40550");
  process.exit(1);
}
console.log("Call 1 - Located invoice:", target.id);

// Call 2: Create credit note
const creditRes = await fetch(`${BASE}/invoice/${target.id}/:createCreditNote?date=2026-03-21&sendToCustomer=false`, {
  method: "PUT",
  headers: H,
});
const creditData = await creditRes.json();
console.log("Call 2 - Credit note:", creditRes.status);
console.log("  id:", creditData.value?.id);
console.log("  isCreditNote:", creditData.value?.isCreditNote);
console.log("  creditedInvoice:", creditData.value?.creditedInvoice);

const ok = creditData.value?.isCreditNote === true && creditData.value?.creditedInvoice === target.id;
console.log(ok ? "\n✓ Sandbox verified: 2-call path for Webdesign/912435113/40550" : "\n✗ FAILED");
