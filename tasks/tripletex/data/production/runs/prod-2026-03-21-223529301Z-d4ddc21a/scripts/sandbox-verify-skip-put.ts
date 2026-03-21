// Verify the skip-PUT branch: project already has correct fixedprice, PM, customer
// Expected: 3 calls (GET /project -> GET /ledger/vatType -> POST /invoice)
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = new Date().toISOString().slice(0, 10);
const h = { "Authorization": AUTH, "Content-Type": "application/json" };

let callCount = 0;
async function get(path: string) {
  callCount++;
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const j = await r.json();
  console.log(`[${callCount}] GET ${path} ${r.status}`);
  if (!r.ok) { console.error(JSON.stringify(j)); throw new Error(`GET ${path} ${r.status}`); }
  return j;
}
async function post(path: string, body: any) {
  callCount++;
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const j = await r.json();
  console.log(`[${callCount}] POST ${path} ${r.status}`);
  if (!r.ok) { console.error(JSON.stringify(j, null, 2)); throw new Error(`POST ${path} ${r.status}`); }
  return j;
}

async function main() {
  // The project was just updated to fixedprice: 170500 in the previous test
  // This simulates the skip-PUT branch

  // Step 1: GET /project
  const projRes = await get("/project?name=Datasikkerhet%2020260320-learning-fixed-price-partial-1774002110092&count=50&fields=*,customer(*),projectManager(*)");
  const proj = projRes.values?.[0];
  if (!proj) { console.error("Project not found"); return; }

  console.log("  fixedprice:", proj.fixedprice, "isFixedPrice:", proj.isFixedPrice);
  console.log("  PM email:", proj.projectManager?.email);

  // Simulate: fixedprice matches, PM matches -> skip PUT
  const needsUpdate = proj.fixedprice !== 170500 || !proj.isFixedPrice;
  console.log("  needsUpdate:", needsUpdate);

  if (needsUpdate) {
    console.log("  ERROR: Project should already be at fixedprice 170500");
    return;
  }

  // Step 2: GET /ledger/vatType
  const vatRes = await get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
  const vatType = vatRes.values?.[0];
  console.log("  vatType:", vatType?.id);

  // Step 3: POST /invoice (direct, no POST /order needed)
  const milestoneAmt = 170500 * 0.33;
  const invRes = await post("/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    customer: { id: proj.customer.id },
    orders: [{
      customer: { id: proj.customer.id },
      project: { id: proj.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: "Milestone payment – 33% of fixed price",
        count: 1,
        unitPriceExcludingVatCurrency: milestoneAmt,
        vatType: { id: vatType.id },
      }],
    }],
  });

  console.log("\n=== RESULTS ===");
  console.log("Total calls:", callCount);
  console.log("invoiceId:", invRes.value?.id);
  console.log("amountExcludingVatCurrency:", invRes.value?.amountExcludingVatCurrency);
  console.log("amountCurrencyOutstanding:", invRes.value?.amountCurrencyOutstanding);
  console.log("projectInvoiceDetails:", invRes.value?.projectInvoiceDetails?.length);
}

main().catch(e => { console.error(e); process.exit(1); });
