// Test: full 10-call flow WITHOUT participant
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
  const date = "2027-01-15";
  let calls = 0;

  // Step 1: dept + customer + PM (3)
  const [deptRes, custRes, pmRes] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=*"),
    post("/customer", { name: `NoPart Inv ${uid} AS`, organizationNumber: "999" + String(uid).slice(-6) }),
    get("/employee?assignableProjectManagers=true&count=1&fields=*"),
  ]);
  calls += 3;
  const deptId = deptRes.values[0].id;
  const custId = custRes.value.id;
  const pmId = pmRes.values[0].id;

  // Step 2: employee + project (2)
  const [empRes, projRes] = await Promise.all([
    post("/employee", {
      firstName: "NoPart", lastName: `Inv${uid}`,
      email: `nopart.inv.${uid}@example.org`, dateOfBirth: "1988-06-01",
      userType: "NO_ACCESS", department: { id: deptId },
    }),
    post("/project", {
      name: `NoPart Project ${uid}`, startDate: date,
      customer: { id: custId }, projectManager: { id: pmId },
      isFixedPrice: true, fixedprice: 20000,
    }),
  ]);
  calls += 2;
  const empId = empRes.value.id;
  const projId = projRes.value.id;

  // Step 3: activity + vatType + account (3) — NO participant
  const [actRes, vatRes, accRes] = await Promise.all([
    post("/project/projectActivity", {
      project: { id: projId }, startDate: date,
      budgetHours: 20, budgetFeeCurrency: 20000,
      activity: { name: "Rådgivning", activityType: "PROJECT_SPECIFIC_ACTIVITY", isChargeable: false },
    }),
    get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=" + date + "&fields=*"),
    get("/ledger/account?number=1920&fields=id,number,name,isBankAccount,bankAccountNumber"),
  ]);
  calls += 3;
  const activityId = actRes.value.activity.id;
  const vatId = vatRes.values[0].id;
  const bankAcc = accRes.values.find((a: any) => a.number === 1920);

  // Step 4: timesheet (1) — uses activity from step 3
  const tsRes = await post("/timesheet/entry/list", [
    { employee: { id: empId }, project: { id: projId }, activity: { id: activityId }, date: date, hours: 20 },
  ]);
  calls += 1;
  console.log("Timesheet: %d entries, hours=%d", tsRes.values.length, tsRes.values[0].hours);

  // Step 5: direct invoice (1)
  const invRes = await post("/invoice?sendToCustomer=false", {
    invoiceDate: date,
    invoiceDueDate: "2027-02-14",
    customer: { id: custId },
    orders: [{
      customer: { id: custId },
      project: { id: projId },
      orderDate: date,
      deliveryDate: date,
      orderLines: [{
        description: "Rådgivning (20h × 1000 NOK)",
        count: 20,
        unitPriceExcludingVatCurrency: 1000,
        vatType: { id: vatId },
      }],
    }],
  });
  calls += 1;

  console.log("\n=== 10-CALL PATH RESULTS (NO PARTICIPANT) ===");
  console.log("Total calls: %d", calls);
  console.log("Invoice: id=%d num=%s amt=%s", invRes.value.id, invRes.value.invoiceNumber, invRes.value.amountExcludingVatCurrency);
  console.log("projectInvoiceDetails: %s", JSON.stringify(invRes.value.projectInvoiceDetails));
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
