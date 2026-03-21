// Verify update-needed path with POST /invoice (replaces POST /order + PUT /order/:invoice)
// Also verify parallelization: PUT /project + GET /ledger/vatType + GET /ledger/account
// Expected: 5 calls (configured bank) or 6 calls (missing bank)
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = new Date().toISOString().slice(0, 10);
const h = { "Authorization": AUTH, "Content-Type": "application/json" };

let callCount = 0;
async function get(path: string) {
  callCount++;
  const n = callCount;
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const j = await r.json();
  console.log(`[${n}] GET ${path} ${r.status}`);
  if (!r.ok) { console.error(JSON.stringify(j)); throw new Error(`GET ${path} ${r.status}`); }
  return j;
}
async function put(path: string, body?: any) {
  callCount++;
  const n = callCount;
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  console.log(`[${n}] PUT ${path} ${r.status}`);
  if (!r.ok) { console.error(JSON.stringify(j)); throw new Error(`PUT ${path} ${r.status}`); }
  return j;
}
async function post(path: string, body: any) {
  callCount++;
  const n = callCount;
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const j = await r.json();
  console.log(`[${n}] POST ${path} ${r.status}`);
  if (!r.ok) { console.error(JSON.stringify(j, null, 2)); throw new Error(`POST ${path} ${r.status}`); }
  return j;
}

const FIXED_PRICE = 245800;  // Different from current 170500 to force update
const MILESTONE_PCT = 0.33;
const MILESTONE_AMT = FIXED_PRICE * MILESTONE_PCT; // 81114

async function main() {
  // Step 1: GET /project (1 call)
  const projRes = await get("/project?name=Datasikkerhet%2020260320-learning-fixed-price-partial-1774002110092&count=50&fields=*,customer(*),projectManager(*)");
  const proj = projRes.values?.[0];
  if (!proj) { console.error("Project not found"); return; }

  const projectId = proj.id;
  const customerId = proj.customer.id;
  const startDate = proj.startDate;
  const pmId = proj.projectManager?.id;

  console.log("  project:", proj.name, "fixedprice:", proj.fixedprice, "(target:", FIXED_PRICE, ")");
  console.log("  needsUpdate:", proj.fixedprice !== FIXED_PRICE);

  // Step 2: PUT /project + GET /ledger/vatType + GET /ledger/account (parallel, 3 calls)
  const [putProjRes, vatRes, acctRes] = await Promise.all([
    put(`/project/${projectId}`, {
      name: proj.name,
      startDate,
      customer: { id: customerId },
      projectManager: { id: pmId },
      isFixedPrice: true,
      fixedprice: FIXED_PRICE,
      invoiceOnAccountVatHigh: false,
    }),
    get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
    get("/ledger/account?isBankAccount=true&fields=*"),
  ]);

  console.log("  Updated fixedprice:", putProjRes.value?.fixedprice);
  const vatType = vatRes.values?.find((v: any) => v.percentage === 25) || vatRes.values?.[0];
  console.log("  vatType:", vatType?.id, "percentage:", vatType?.percentage);

  const accts = acctRes.values || [];
  const invoiceAcct = accts.find((a: any) => a.number === 1920) || accts[0];
  console.log("  bank account:", invoiceAcct?.id, "number:", invoiceAcct?.number, "bankAccountNumber:", invoiceAcct?.bankAccountNumber);

  // Step 3: Fix bank if needed (0-1 calls)
  if (invoiceAcct && !invoiceAcct.bankAccountNumber) {
    await put(`/ledger/account/${invoiceAcct.id}`, {
      ...invoiceAcct,
      bankAccountNumber: "12345678903",
    });
    console.log("  Bank account fixed");
  }

  // Step 4: POST /invoice (1 call)
  const invRes = await post("/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      project: { id: projectId },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: `Milestone payment – ${MILESTONE_PCT * 100}% of fixed price`,
        count: 1,
        unitPriceExcludingVatCurrency: MILESTONE_AMT,
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
