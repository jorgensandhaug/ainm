// Sandbox verification: confirm the 2-call credit-note path still works
// Create a fixture customer + invoice, then credit it with the standard 2-call path

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const today = "2026-03-22";
const tomorrow = "2026-03-23";

// --- Setup: create fixture customer ---
const custRes = await fetch(`${BASE}/customer`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({ name: "SandboxCreditTest " + Date.now(), organizationNumber: "900993560", invoiceSendMethod: "MANUAL" })
});
const cust = (await custRes.json()).value;
console.log("Created customer:", cust.id, cust.name);

// --- Setup: create order ---
const orderRes = await fetch(`${BASE}/order`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    customer: { id: cust.id },
    deliveryDate: today,
    orderDate: today,
    orderLines: [{ description: "Maintenance", count: 1, unitPriceExcludingVatCurrency: 30500, vatType: { id: 3 } }]
  })
});
const order = (await orderRes.json()).value;
console.log("Created order:", order.id);

// --- Setup: invoice the order ---
const invRes = await fetch(`${BASE}/order/${order.id}/:invoice?invoiceDate=${today}&sendToCustomer=false`, {
  method: "PUT",
  headers: H
});
const inv = (await invRes.json()).value;
console.log("Created invoice:", inv.id, "amount excl VAT:", inv.amountExcludingVatCurrency);

// === PRODUCTION PATH SIMULATION: 2 calls ===
console.log("\n=== Simulating production 2-call path ===");

// Call 1: Locate
const locateUrl = `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=${tomorrow}&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
const locateRes = await fetch(locateUrl, { headers: H });
const locateData = await locateRes.json();
const invoices = locateData.values || [];

const candidates = invoices.filter((i: any) => {
  if (i.isCreditNote || i.isCredited) return false;
  if (i.customer?.organizationNumber !== "900993560") return false;
  if (i.amountExcludingVatCurrency !== 30500) return false;
  const descs: string[] = [];
  (i.orderLines || []).forEach((ol: any) => descs.push(ol.description));
  (i.orders || []).forEach((o: any) => (o.orderLines || []).forEach((ol: any) => descs.push(ol.description)));
  return descs.some((d: string) => d === "Maintenance");
});
console.log("Candidates found:", candidates.length);
const target = candidates.reduce((a: any, b: any) => a.id > b.id ? a : b);
console.log("Selected invoice:", target.id, "invoiceNumber:", target.invoiceNumber);

// Call 2: Create credit note
const creditUrl = `${BASE}/invoice/${target.id}/:createCreditNote?date=${today}&sendToCustomer=false`;
const creditRes2 = await fetch(creditUrl, { method: "PUT", headers: H });
const creditData = await creditRes2.json();
const cn = creditData.value;
console.log("Credit note created:", cn.id, "invoiceNumber:", cn.invoiceNumber, "isCreditNote:", cn.isCreditNote, "creditedInvoice:", cn.creditedInvoice, "amount:", cn.amountCurrency);
console.log("\n=== Sandbox verification PASSED: 2-call path works ===");
