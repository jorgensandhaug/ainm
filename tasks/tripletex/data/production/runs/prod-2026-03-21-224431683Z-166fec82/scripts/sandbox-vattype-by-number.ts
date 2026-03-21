// Test if vatType can be specified by number instead of id
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  const custRes = await (await fetch(`${BASE}/customer?count=1&fields=id`, { headers: h })).json();
  const projRes = await (await fetch(`${BASE}/project?count=1&fields=id`, { headers: h })).json();
  const customerId = custRes.values[0].id;
  const projectId = projRes.values[0].id;

  // Test 1: vatType by number (number=6 is "ingen utgående avgift" in sandbox)
  const r1 = await fetch(`${BASE}/invoice?sendToCustomer=false`, {
    method: "POST", headers: h,
    body: JSON.stringify({
      invoiceDate: "2026-03-22",
      invoiceDueDate: "2026-04-22",
      customer: { id: customerId },
      orders: [{
        customer: { id: customerId },
        project: { id: projectId },
        orderDate: "2026-03-22",
        deliveryDate: "2026-03-22",
        orderLines: [{
          description: "Test vatType by number",
          count: 1,
          unitPriceExcludingVatCurrency: 3000,
          vatType: { number: 6 },
        }],
      }],
    }),
  });
  const j1 = await r1.json();
  console.log("vatType by number:", r1.status, r1.ok ? `amount=${j1.value.amount}` : JSON.stringify(j1));

  // Test 2: no vatType at all
  const r2 = await fetch(`${BASE}/invoice?sendToCustomer=false`, {
    method: "POST", headers: h,
    body: JSON.stringify({
      invoiceDate: "2026-03-22",
      invoiceDueDate: "2026-04-22",
      customer: { id: customerId },
      orders: [{
        customer: { id: customerId },
        project: { id: projectId },
        orderDate: "2026-03-22",
        deliveryDate: "2026-03-22",
        orderLines: [{
          description: "Test no vatType",
          count: 1,
          unitPriceExcludingVatCurrency: 3000,
        }],
      }],
    }),
  });
  const j2 = await r2.json();
  console.log("no vatType:", r2.status, r2.ok ? `amount=${j2.value.amount} amtExVat=${j2.value.amountExcludingVatCurrency}` : JSON.stringify(j2));

  // Test 3: vatType with id=6 (known sandbox id)
  const r3 = await fetch(`${BASE}/invoice?sendToCustomer=false`, {
    method: "POST", headers: h,
    body: JSON.stringify({
      invoiceDate: "2026-03-22",
      invoiceDueDate: "2026-04-22",
      customer: { id: customerId },
      orders: [{
        customer: { id: customerId },
        project: { id: projectId },
        orderDate: "2026-03-22",
        deliveryDate: "2026-03-22",
        orderLines: [{
          description: "Test vatType id=6",
          count: 1,
          unitPriceExcludingVatCurrency: 3000,
          vatType: { id: 6 },
        }],
      }],
    }),
  });
  const j3 = await r3.json();
  console.log("vatType id=6:", r3.status, r3.ok ? `amount=${j3.value.amount}` : JSON.stringify(j3));

  // Check: are there more vatTypes with vatDate=2026-03-22?
  const vtRes = await (await fetch(`${BASE}/ledger/vatType?vatDate=2026-03-22&fields=id,name,number,percentage,typeOfVat`, { headers: h })).json();
  console.log("\nAll vatTypes for 2026-03-22:");
  for (const v of vtRes.values || []) {
    if (v.percentage > 0 || v.typeOfVat === "OUTGOING") {
      console.log(`  id=${v.id} num=${v.number} pct=${v.percentage}% type=${v.typeOfVat} name=${v.name}`);
    }
  }
}
main();
