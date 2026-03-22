const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const AUTH = "Basic " + btoa("0:eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9");
const h = { "Content-Type": "application/json", Authorization: AUTH };
const TODAY = new Date().toISOString().slice(0, 10);

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  return { status: r.status, data: b };
}

async function main() {
  // Check account 1920 state
  const acct = await get("/ledger/account?number=1920&fields=id,number,name,isBankAccount,bankAccountNumber");
  console.log("Account 1920:", JSON.stringify(acct.data.values?.[0], null, 2));

  // Check if fresh accounts have bankAccountNumber on 1920
  // In the production run, the PUT was conditional: only if !bankAccountNumber
  // If fresh accounts ALWAYS lack bankAccountNumber, the PUT always executes (+1 call)
  // If they sometimes have it, it's conditional

  // The question: does the invoice NEED a bank account on 1920?
  // The production run's invoice succeeded even though we don't know if 1920 had bankAccountNumber
  // Let me check what the scorer checks for

  // Also: the structural optimization — can we move supplier to step 1?
  // Already confirmed: POST /supplier has no dependencies

  // Test: can we do a 4-phase flow (restructured)?
  console.log("\n=== 4-PHASE FLOW TEST ===");

  // Phase 1: All GETs + POST customer + POST supplier
  const ts = Date.now();
  const [dept, pm, accounts, vt, vat, cust, supp] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=id"),
    get("/employee?assignableProjectManagers=true&count=1&fields=id"),
    get("/ledger/account?number=6590,2400&fields=id,number"),  // NO 1920 — skip bank account handling
    get("/ledger/voucherType?name=Leverandørfaktura&count=1&fields=id"),
    get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=" + TODAY + "&fields=id"),
    (async () => {
      const r = await fetch(`${BASE}/customer`, { method: "POST", headers: h, body: JSON.stringify({ name: `Test4Phase${ts}`, isCustomer: true }) });
      return { status: r.status, data: await r.json() };
    })(),
    (async () => {
      const r = await fetch(`${BASE}/supplier`, { method: "POST", headers: h, body: JSON.stringify({ name: `Test4PSupp${ts}`, isSupplier: true }) });
      return { status: r.status, data: await r.json() };
    })(),
  ]);
  console.log("Phase 1: 7 parallel calls");
  console.log("  dept:", dept.status, "pm:", pm.status, "acct:", accounts.status, "vt:", vt.status, "vat:", vat.status, "cust:", cust.status, "supp:", supp.status);

  const deptId = dept.data.values[0].id;
  const pmId = pm.data.values[0].id;
  const a6590 = accounts.data.values.find((a: any) => a.number === 6590);
  const a2400 = accounts.data.values.find((a: any) => a.number === 2400);
  const vtId = vt.data.values[0].id;
  const vatId = vat.data.values[0].id;
  const custId = cust.data.value.id;
  const suppId = supp.data.value.id;

  // Phase 2: employees + project
  const [empsR, projR] = await Promise.all([
    (async () => {
      const r = await fetch(`${BASE}/employee/list`, { method: "POST", headers: h, body: JSON.stringify([
        { firstName: "Phase4PM", lastName: "Test", email: `pm${ts}@test.org`, dateOfBirth: "1988-01-01", userType: "NO_ACCESS", department: { id: deptId } },
        { firstName: "Phase4Con", lastName: "Test", email: `con${ts}@test.org`, dateOfBirth: "1992-01-01", userType: "NO_ACCESS", department: { id: deptId } },
      ])});
      return { status: r.status, data: await r.json() };
    })(),
    (async () => {
      const r = await fetch(`${BASE}/project`, { method: "POST", headers: h, body: JSON.stringify({
        name: `Project4Phase${ts}`, startDate: TODAY, customer: { id: custId },
        projectManager: { id: pmId }, isFixedPrice: true, fixedprice: 50000,
      })});
      return { status: r.status, data: await r.json() };
    })(),
  ]);
  console.log("Phase 2: 2 parallel calls — emps:", empsR.status, "proj:", projR.status);
  const e1 = empsR.data.values[0].id;
  const e2 = empsR.data.values[1].id;
  const pId = projR.data.value.id;

  // Phase 3: activity + participants + orderline + voucher (4 parallel)
  const [actR, partsR, olR, vouchR] = await Promise.all([
    (async () => {
      const r = await fetch(`${BASE}/project/projectActivity`, { method: "POST", headers: h, body: JSON.stringify({
        project: { id: pId }, startDate: TODAY, budgetHours: 20, budgetFeeCurrency: 50000,
        activity: { name: "Prosjektaktivitet", activityType: "PROJECT_SPECIFIC_ACTIVITY", isChargeable: false },
      })});
      return { status: r.status, data: await r.json() };
    })(),
    (async () => {
      const r = await fetch(`${BASE}/project/participant/list`, { method: "POST", headers: h, body: JSON.stringify([
        { project: { id: pId }, employee: { id: e1 }, adminAccess: true },
        { project: { id: pId }, employee: { id: e2 }, adminAccess: false },
      ])});
      return { status: r.status, data: await r.json() };
    })(),
    (async () => {
      const r = await fetch(`${BASE}/project/orderline`, { method: "POST", headers: h, body: JSON.stringify({
        project: { id: pId }, description: "Leverandørkostnad", date: TODAY,
        count: 1, unitCostCurrency: 10000, isChargeable: false,
      })});
      return { status: r.status, data: await r.json() };
    })(),
    (async () => {
      const r = await fetch(`${BASE}/ledger/voucher`, { method: "POST", headers: h, body: JSON.stringify({
        date: TODAY, description: "Leverandørkostnad", voucherType: { id: vtId },
        postings: [
          { row: 1, date: TODAY, description: "Cost", account: { id: a6590.id },
            amount: 10000, amountCurrency: 10000, amountGross: 10000, amountGrossCurrency: 10000,
            project: { id: pId } },
          { row: 2, date: TODAY, description: "Debt", account: { id: a2400.id },
            amount: -10000, amountCurrency: -10000, amountGross: -10000, amountGrossCurrency: -10000,
            supplier: { id: suppId } },
        ],
      })});
      return { status: r.status, data: await r.json() };
    })(),
  ]);
  console.log("Phase 3: 4 parallel calls — act:", actR.status, "parts:", partsR.status, "ol:", olR.status, "vouch:", vouchR.status);
  if (actR.status !== 201) console.log("  act error:", JSON.stringify(actR.data).slice(0, 200));
  if (partsR.status !== 201) console.log("  parts error:", JSON.stringify(partsR.data).slice(0, 200));
  if (olR.status !== 201) console.log("  ol error:", JSON.stringify(olR.data).slice(0, 200));
  if (vouchR.status !== 201) console.log("  vouch error:", JSON.stringify(vouchR.data).slice(0, 200));

  const actId = actR.data.value?.activity?.id;

  // Phase 4: timesheet + invoice (2 parallel)
  const dd = new Date(Date.UTC(2026, 2, 22 + 14)).toISOString().slice(0, 10);
  const [tsR, invR] = await Promise.all([
    (async () => {
      const entries = [
        { employee: { id: e1 }, project: { id: pId }, activity: { id: actId }, date: TODAY, hours: 10 },
        { employee: { id: e2 }, project: { id: pId }, activity: { id: actId }, date: TODAY, hours: 10 },
      ];
      const r = await fetch(`${BASE}/timesheet/entry/list`, { method: "POST", headers: h, body: JSON.stringify(entries) });
      return { status: r.status, data: await r.json() };
    })(),
    (async () => {
      const r = await fetch(`${BASE}/invoice?sendToCustomer=false`, { method: "POST", headers: h, body: JSON.stringify({
        invoiceDate: TODAY, invoiceDueDate: dd, customer: { id: custId },
        orders: [{
          customer: { id: custId }, project: { id: pId },
          orderDate: TODAY, deliveryDate: TODAY,
          orderLines: [{
            description: "Test invoice", count: 1,
            unitPriceExcludingVatCurrency: 50000, vatType: { id: vatId },
          }],
        }],
      })});
      return { status: r.status, data: await r.json() };
    })(),
  ]);
  console.log("Phase 4: 2 parallel calls — timesheet:", tsR.status, "invoice:", invR.status);
  if (tsR.status !== 201) console.log("  ts error:", JSON.stringify(tsR.data).slice(0, 200));
  if (invR.status !== 201) console.log("  inv error:", JSON.stringify(invR.data).slice(0, 200));

  console.log("\n=== SUMMARY ===");
  console.log("Total calls: 7 + 2 + 4 + 2 = 15 (no bank account PUT needed)");
  console.log("Sequential phases: 4 (down from 5)");
  console.log("All statuses: Phase1=[" + [dept,pm,accounts,vt,vat,cust,supp].map(x=>x.status).join(",") + "]");
  console.log("              Phase2=[" + [empsR,projR].map(x=>x.status).join(",") + "]");
  console.log("              Phase3=[" + [actR,partsR,olR,vouchR].map(x=>x.status).join(",") + "]");
  console.log("              Phase4=[" + [tsR,invR].map(x=>x.status).join(",") + "]");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
