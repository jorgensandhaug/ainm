const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const AUTH = "Basic " + btoa("0:eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9");
const h = { "Content-Type": "application/json", Authorization: AUTH };
const TODAY = new Date().toISOString().slice(0, 10);

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  console.log(`GET ${path} → ${r.status}`);
  return { status: r.status, data: b };
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  console.log(`POST ${path} → ${r.status}`);
  if (!r.ok) console.log("  Error:", JSON.stringify(b).slice(0, 300));
  return { status: r.status, data: b };
}

async function main() {
  // TEST 1: Can employees be created WITHOUT department?
  console.log("\n=== TEST 1: Employee without department ===");
  const empNoDept = await post("/employee", {
    firstName: "TestNoDept", lastName: "Person", email: "nodept@test.org",
    dateOfBirth: "1990-01-01", userType: "NO_ACCESS",
  });
  console.log("  Result:", empNoDept.status, empNoDept.status === 201 ? "SUCCESS — department NOT required" : "FAILED — department required");

  // TEST 2: Can POST /supplier be in step 1 (no dependencies)?
  // → Already known: POST /supplier only needs name + org, no dependencies. YES it can be in step 1.

  // TEST 3: Test parallel voucher + invoice creation
  // First set up prerequisites
  console.log("\n=== TEST 3: Setting up prerequisites for parallel voucher+invoice test ===");
  const [acct, vt, vat, pm] = await Promise.all([
    get("/ledger/account?number=6590,2400&fields=id,number"),
    get("/ledger/voucherType?name=Leverandørfaktura&count=1&fields=id"),
    get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=" + TODAY + "&fields=id"),
    get("/employee?assignableProjectManagers=true&count=1&fields=id"),
  ]);

  const a6590 = acct.data.values?.find((a: any) => a.number === 6590);
  const a2400 = acct.data.values?.find((a: any) => a.number === 2400);
  const vtId = vt.data.values?.[0]?.id;
  const vatId = vat.data.values?.[0]?.id;
  const pmId = pm.data.values?.[0]?.id;

  // Create customer, supplier, and project
  const ts = Date.now();
  const [custR, suppR] = await Promise.all([
    post("/customer", { name: `SandboxCust${ts}`, isCustomer: true }),
    post("/supplier", { name: `SandboxSupp${ts}`, isSupplier: true }),
  ]);
  const custId = custR.data.value?.id;
  const suppId = suppR.data.value?.id;

  const projR = await post("/project", {
    name: `SandboxProj${ts}`,
    startDate: TODAY,
    customer: { id: custId },
    projectManager: { id: pmId },
    isFixedPrice: true,
    fixedprice: 100000,
  });
  const pId = projR.data.value?.id;

  // Now test parallel voucher + invoice
  console.log("\n=== TEST 3: Parallel voucher + invoice ===");
  const dd = new Date(Date.UTC(2026, 2, 22 + 14)).toISOString().slice(0, 10);
  const results = await Promise.allSettled([
    post("/ledger/voucher", {
      date: TODAY, description: "Test cost", voucherType: { id: vtId },
      postings: [
        { row: 1, date: TODAY, description: "Cost", account: { id: a6590?.id },
          amount: 10000, amountCurrency: 10000, amountGross: 10000, amountGrossCurrency: 10000,
          project: { id: pId } },
        { row: 2, date: TODAY, description: "Debt", account: { id: a2400?.id },
          amount: -10000, amountCurrency: -10000, amountGross: -10000, amountGrossCurrency: -10000,
          supplier: { id: suppId } },
      ],
    }),
    post("/invoice?sendToCustomer=false", {
      invoiceDate: TODAY, invoiceDueDate: dd, customer: { id: custId },
      orders: [{
        customer: { id: custId },
        project: { id: pId },
        orderDate: TODAY, deliveryDate: TODAY,
        orderLines: [{
          description: "Test invoice",
          count: 1,
          unitPriceExcludingVatCurrency: 100000,
          vatType: { id: vatId },
        }],
      }],
    }),
  ]);

  for (const [i, r] of results.entries()) {
    const label = i === 0 ? "Voucher" : "Invoice";
    if (r.status === "fulfilled") {
      console.log(`  ${label}: ${r.value.status}`);
    } else {
      console.log(`  ${label}: REJECTED — ${r.reason}`);
    }
  }

  // TEST 4: Can we move POST /supplier to step 1 and POST /project/orderline + POST /voucher to step 3?
  // This is a structural question — the answer is yes based on dependency analysis:
  // - POST /supplier has no dependencies → step 1
  // - POST /project/orderline depends on project ID → step 3 (after step 2 creates project)
  // - POST /voucher depends on supplier ID (step 1), account IDs (step 1), project ID (step 2) → step 3
  // This reduces from 5 sequential phases to 4
  console.log("\n=== STRUCTURAL ANALYSIS ===");
  console.log("Current flow: 5 sequential phases, 15-16 calls");
  console.log("Optimized flow: 4 sequential phases, same 15-16 calls");
  console.log("Phase 1: 5 GETs + POST customer + POST supplier = 7 parallel");
  console.log("Phase 2: POST employees + POST project (+ conditional PUT account) = 2-3 parallel");
  console.log("Phase 3: POST activity + POST participants + POST orderline + POST voucher = 4 parallel");
  console.log("Phase 4: POST timesheet + POST invoice = 2 parallel");
  console.log("NOTE: POST timesheet needs activity ID from phase 3; POST invoice is independent");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
