// Check the created invoice details to see default vatType behavior
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
  console.log("\nInvoice WITHOUT vatType:");
  console.log("  amountExcludingVat:", inv1.value.amountExcludingVatCurrency);
  console.log("  amountRoundoff:", inv1.value.amountRoundoffCurrency);

  // Read it back with full fields
  const rb1 = await get(`/invoice/${inv1Id}?fields=*,orders(*),orders.orderLines(*)`);
  const line1 = rb1.value.orders?.[0]?.orderLines?.[0];
  console.log("  line vatType:", JSON.stringify(line1?.vatType));
  console.log("  line amountExcludingVat:", line1?.amountExcludingVatCurrency);
  console.log("  line amountIncludingVat:", line1?.amountIncludingVatCurrency);
  console.log("  invoice amount:", rb1.value.amount);
  console.log("  invoice amountExcludingVat:", rb1.value.amountExcludingVatCurrency);

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
        description: "Test WITH vatType",
        count: 1,
        unitPriceExcludingVatCurrency: 5000,
        vatType: { id: vat25.id },
      }],
    }],
  });

  const inv2Id = inv2.value.id;
  const rb2 = await get(`/invoice/${inv2Id}?fields=*,orders(*),orders.orderLines(*)`);
  const line2 = rb2.value.orders?.[0]?.orderLines?.[0];
  console.log("\nInvoice WITH vatType:");
  console.log("  line vatType:", JSON.stringify(line2?.vatType));
  console.log("  line amountExcludingVat:", line2?.amountExcludingVatCurrency);
  console.log("  line amountIncludingVat:", line2?.amountIncludingVatCurrency);
  console.log("  invoice amount:", rb2.value.amount);
  console.log("  invoice amountExcludingVat:", rb2.value.amountExcludingVatCurrency);
}

main().catch(e => console.error("FATAL:", e));
