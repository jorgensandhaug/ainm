/**
 * Sandbox verification: prove that when multiple invoices match all criteria,
 * picking the most recent one (highest id) and crediting it works in 2 calls.
 *
 * This simulates the production scenario where two identical invoices exist
 * for the same customer with the same amount and description.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const DATE = "2026-03-22";
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers });
  if (!r.ok) throw new Error(`GET ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function put(path: string) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers });
  if (!r.ok) throw new Error(`PUT ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

// --- Setup: create a customer and TWO identical invoices ---
console.log("=== SETUP ===");

// Find or create customer
const custSearch = await get("/customer?organizationNumber=949502619&fields=id,name");
let custId: number;
if (custSearch.count > 0) {
  custId = custSearch.values[0].id;
  console.log("Existing customer id:", custId);
} else {
  const custRes = await post("/customer", { name: "Elvdal AS", organizationNumber: "949502619", isCustomer: true });
  custId = custRes.value.id;
  console.log("Created customer id:", custId);
}

// Create two identical orders+invoices
for (let i = 0; i < 2; i++) {
  const orderRes = await post("/order", {
    customer: { id: custId },
    deliveryDate: DATE,
    orderDate: DATE,
    orderLines: [{ description: "Programvarelisens", count: 1, unitPriceExcludingVatCurrency: 11250, vatType: { id: 3 } }],
  });
  const orderId = orderRes.value.id;
  console.log(`Order ${i + 1} id:`, orderId);

  const invRes = await put(`/order/${orderId}/:invoice?invoiceDate=${DATE}&sendToCustomer=false`);
  console.log(`Invoice ${i + 1} id:`, invRes.value.id, "number:", invRes.value.invoiceNumber);
}

console.log("\n=== PRODUCTION SIMULATION: 2-call path with duplicate handling ===");

// Call 1: GET /invoice
const locateUrl = `/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
console.log("Call 1: GET", locateUrl);
const locateData = await get(locateUrl);
const invoices = locateData.values || [];
console.log(`Total invoices: ${invoices.length}`);

// Filter to target
const candidates = invoices.filter((inv: any) => {
  if (inv.isCreditNote || inv.isCredited) return false;
  if (inv.customer?.organizationNumber !== "949502619") return false;
  if (inv.amountExcludingVatCurrency !== 11250 && inv.amountExcludingVat !== 11250) return false;
  const topDesc = (inv.orderLines || []).some((ol: any) => ol.description === "Programvarelisens");
  const nestedDesc = (inv.orders || []).some((o: any) =>
    (o.orderLines || []).some((ol: any) => ol.description === "Programvarelisens")
  );
  return topDesc || nestedDesc;
});

console.log(`Matching candidates: ${candidates.length}`);
for (const c of candidates) {
  console.log(`  id=${c.id} invoiceNumber=${c.invoiceNumber} date=${c.invoiceDate} amt=${c.amountExcludingVatCurrency}`);
}

// KEY FIX: when multiple match, pick the latest (highest id)
const target = candidates.sort((a: any, b: any) => b.id - a.id)[0];
console.log(`Selected target (highest id): id=${target.id}`);

// Call 2: PUT createCreditNote
const creditUrl = `/invoice/${target.id}/:createCreditNote?date=${DATE}&sendToCustomer=false`;
console.log("Call 2: PUT", creditUrl);
const creditData = await put(creditUrl);
const cn = creditData.value;
console.log("Credit note created:");
console.log("  id:", cn.id);
console.log("  invoiceNumber:", cn.invoiceNumber);
console.log("  isCreditNote:", cn.isCreditNote);
console.log("  creditedInvoice:", cn.creditedInvoice);
console.log("  amountExcludingVatCurrency:", cn.amountExcludingVatCurrency);

console.log("\n=== RESULT: 2 API calls (1 GET + 1 PUT), 0 errors ===");
console.log("The duplicate-handling heuristic (pick highest id) avoids ambiguity without extra calls.");
