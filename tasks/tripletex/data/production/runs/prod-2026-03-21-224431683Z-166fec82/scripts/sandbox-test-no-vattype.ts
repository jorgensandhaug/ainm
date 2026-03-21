// Test: can we skip GET /ledger/vatType and omit vatType from invoice orderLines?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const j = await r.json();
  console.log("GET", path, r.status);
  return j;
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const j = await r.json();
  console.log("POST", path, r.status, r.ok ? "" : JSON.stringify(j));
  return { ok: r.ok, data: j };
}

async function main() {
  // Get an existing customer to test with
  const custRes = await get("/customer?count=1&fields=id,name");
  const customerId = custRes.values[0].id;
  console.log("Using customer:", customerId, custRes.values[0].name);

  // Get an existing project
  const projRes = await get("/project?count=1&fields=id,name");
  const projectId = projRes.values[0].id;
  console.log("Using project:", projectId, projRes.values[0].name);

  // Try invoice WITHOUT vatType on orderLines
  const noVat = await post("/invoice?sendToCustomer=false", {
    invoiceDate: "2026-03-21",
    invoiceDueDate: "2026-04-20",
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      project: { id: projectId },
      orderDate: "2026-03-21",
      deliveryDate: "2026-03-21",
      orderLines: [{
        description: "Test no vatType",
        count: 1,
        unitPriceExcludingVatCurrency: 1000,
      }],
    }],
  });

  if (noVat.ok) {
    console.log("SUCCESS without vatType! Invoice created");
    console.log("  amount:", noVat.data.value.amountExcludingVatCurrency);
    console.log("  vatType on line:", JSON.stringify(noVat.data.value.orders?.[0]?.orderLines?.[0]?.vatType));
  } else {
    console.log("FAILED without vatType — need to keep GET vatType");
  }
}

main().catch(e => console.error("FATAL:", e));
