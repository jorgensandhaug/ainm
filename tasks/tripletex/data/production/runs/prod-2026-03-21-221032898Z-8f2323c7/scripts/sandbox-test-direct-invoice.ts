// Test: full create-from-scratch flow with direct POST /invoice (no POST /order)
// Verifies that projectInvoiceDetails is populated
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(p: string) {
  const r = await fetch(`${BASE}${p}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${p} → ${r.status} ${await r.text()}`);
  return r.json();
}
async function post(p: string, b: any) {
  const r = await fetch(`${BASE}${p}`, { method: "POST", headers: H, body: JSON.stringify(b) });
  if (!r.ok) throw new Error(`POST ${p} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function main() {
  const uid = Date.now();
  const date = "2026-12-01";
  let calls = 0;

  // Step 1: dept + customer + PM (3 parallel)
  const [deptRes, custRes, pmRes] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=*"),
    post("/customer", { name: `DirectInv Test ${uid} AS`, organizationNumber: "999" + String(uid).slice(-6) }),
    get("/employee?assignableProjectManagers=true&count=1&fields=*"),
  ]);
  calls += 3;
  const deptId = deptRes.values[0].id;
  const custId = custRes.value.id;
  const pmId = pmRes.values[0].id;
  console.log("S1: dept=%d cust=%d pm=%d (%d calls)", deptId, custId, pmId, calls);

  // Step 2: employee + project (2 parallel)
  const [empRes, projRes] = await Promise.all([
    post("/employee", {
      firstName: "Test", lastName: `Direct${uid}`,
      email: `direct.${uid}@example.org`, dateOfBirth: "1990-01-01",
      userType: "NO_ACCESS", department: { id: deptId },
    }),
    post("/project", {
      name: `DirectInv Project ${uid}`, startDate: date,
      customer: { id: custId }, projectManager: { id: pmId },
      isFixedPrice: true, fixedprice: 15500,
    }),
  ]);
  calls += 2;
  const empId = empRes.value.id;
  const projId = projRes.value.id;
  console.log("S2: emp=%d proj=%d (%d calls)", empId, projId, calls);

  // Step 3: activity + participant (2 parallel)
  const [actRes, _partRes] = await Promise.all([
    post("/project/projectActivity", {
      project: { id: projId }, startDate: date,
      budgetHours: 10, budgetFeeCurrency: 15500,
      activity: { name: "Rådgivning", activityType: "PROJECT_SPECIFIC_ACTIVITY", isChargeable: false },
    }),
    post("/project/participant", {
      project: { id: projId }, employee: { id: empId }, adminAccess: false,
    }),
  ]);
  calls += 2;
  const activityId = actRes.value.activity.id;
  console.log("S3: act=%d (%d calls)", activityId, calls);

  // Step 4: timesheet + vatType + account (3 parallel)
  const [tsRes, vatRes, accRes] = await Promise.all([
    post("/timesheet/entry/list", [
      { employee: { id: empId }, project: { id: projId }, activity: { id: activityId }, date: date, hours: 10 },
    ]),
    get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=" + date + "&fields=*"),
    get("/ledger/account?number=1920&fields=id,number,name,isBankAccount,bankAccountNumber"),
  ]);
  calls += 3;
  console.log("S4: ts=%d entries (%d calls)", tsRes.values.length, calls);

  const vatId = vatRes.values[0].id;
  const bankAcc = accRes.values.find((a: any) => a.number === 1920);
  console.log("  vatId=%d, bankAcc=%d, hasBankNum=%s", vatId, bankAcc?.id, !!bankAcc?.bankAccountNumber);

  // Step 5: direct invoice
  const invRes = await post("/invoice?sendToCustomer=false", {
    invoiceDate: date,
    invoiceDueDate: "2026-12-31",
    customer: { id: custId },
    orders: [{
      customer: { id: custId },
      project: { id: projId },
      orderDate: date,
      deliveryDate: date,
      orderLines: [{
        description: "Rådgivning (10h × 1550 NOK)",
        count: 10,
        unitPriceExcludingVatCurrency: 1550,
        vatType: { id: vatId },
      }],
    }],
  });
  calls += 1;

  console.log("\n=== RESULTS ===");
  console.log("Total calls: %d", calls);
  console.log("Invoice id: %d", invRes.value.id);
  console.log("Invoice number: %s", invRes.value.invoiceNumber);
  console.log("amountExcludingVatCurrency: %s", invRes.value.amountExcludingVatCurrency);
  console.log("projectInvoiceDetails: %s", JSON.stringify(invRes.value.projectInvoiceDetails));
  console.log("orders count: %d", invRes.value.orders?.length);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
