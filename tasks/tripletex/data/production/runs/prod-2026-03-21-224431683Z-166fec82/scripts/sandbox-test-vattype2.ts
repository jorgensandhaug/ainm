// Compare invoice with/without vatType — fixed fields query
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  return r.json();
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const j = await r.json();
  console.log("POST", path, r.status);
  return j;
}

async function main() {
  const custRes = await get("/customer?count=1&fields=id,name");
  const customerId = custRes.values[0].id;
  const projRes = await get("/project?count=1&fields=id,name");
  const projectId = projRes.values[0].id;

  // Create invoice WITHOUT vatType
  const inv1 = await post("/invoice?sendToCustomer=false", {
    invoiceDate: "2026-03-21",
    invoiceDueDate: "2026-04-20",
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      project: { id: projectId },
      orderDate: "2026-03-21",
      deliveryDate: "2026-03-21",
      orderLines: [{
        description: "Test WITHOUT vatType",
        count: 1,
        unitPriceExcludingVatCurrency: 5000,
      }],
    }],
  });

  const inv1Id = inv1.value.id;
  console.log("\nInvoice WITHOUT vatType (write response):");
  console.log("  amountExcludingVat:", inv1.value.amountExcludingVatCurrency);
  console.log("  amount:", inv1.value.amount);

  // Read it back
  const rb1 = await get(`/invoice/${inv1Id}?fields=id,amount,amountExcludingVatCurrency`);
  console.log("  readback amount:", rb1.value.amount);
  console.log("  readback amountExcludingVat:", rb1.value.amountExcludingVatCurrency);

  // Read the order lines
  const ordersRes = await get(`/order?invoiceIds=${inv1Id}&fields=id,orderLines`);
  if (ordersRes.values?.length > 0) {
    const orderId = ordersRes.values[0].id;
    const olRes = await get(`/order/orderline?orderId=${orderId}&fields=*`);
    if (olRes.values?.length > 0) {
      const ol = olRes.values[0];
      console.log("  orderLine vatType:", JSON.stringify(ol.vatType));
      console.log("  orderLine amountExcludingVat:", ol.amountExcludingVatCurrency);
      console.log("  orderLine amountIncludingVat:", ol.amountIncludingVatCurrency);
    }
  }

  // Now create WITH vatType for comparison
  const vatRes = await get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=id,name,number,percentage");
  const vat25 = vatRes.values.find((v: any) => v.percentage === 25);
  console.log("\nVAT type 25%:", JSON.stringify(vat25));

  const inv2 = await post("/invoice?sendToCustomer=false", {
    invoiceDate: "2026-03-21",
    invoiceDueDate: "2026-04-20",
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      project: { id: projectId },
      orderDate: "2026-03-21",
      deliveryDate: "2026-03-21",
      orderLines: [{
        description: "Test WITH vatType 25%",
        count: 1,
        unitPriceExcludingVatCurrency: 5000,
        vatType: { id: vat25.id },
      }],
    }],
  });

  const inv2Id = inv2.value.id;
  console.log("\nInvoice WITH vatType (write response):");
  console.log("  amountExcludingVat:", inv2.value.amountExcludingVatCurrency);
  console.log("  amount:", inv2.value.amount);

  const rb2 = await get(`/invoice/${inv2Id}?fields=id,amount,amountExcludingVatCurrency`);
  console.log("  readback amount:", rb2.value.amount);
  console.log("  readback amountExcludingVat:", rb2.value.amountExcludingVatCurrency);

  const ordersRes2 = await get(`/order?invoiceIds=${inv2Id}&fields=id,orderLines`);
  if (ordersRes2.values?.length > 0) {
    const orderId2 = ordersRes2.values[0].id;
    const olRes2 = await get(`/order/orderline?orderId=${orderId2}&fields=*`);
    if (olRes2.values?.length > 0) {
      const ol2 = olRes2.values[0];
      console.log("  orderLine vatType:", JSON.stringify(ol2.vatType));
      console.log("  orderLine amountExcludingVat:", ol2.amountExcludingVatCurrency);
      console.log("  orderLine amountIncludingVat:", ol2.amountIncludingVatCurrency);
    }
  }
}

main().catch(e => console.error("FATAL:", e));
