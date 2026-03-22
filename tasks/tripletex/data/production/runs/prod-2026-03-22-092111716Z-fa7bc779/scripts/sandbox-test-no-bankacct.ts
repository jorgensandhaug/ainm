// Test: Can we skip GET /ledger/account entirely?
// Check if invoice creation works without bank account number on 1920
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const AUTH = "Basic " + btoa("0:eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9");
const h = { "Content-Type": "application/json", Authorization: AUTH };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  return { ok: r.ok, status: r.status, data: await r.json() };
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  return { ok: r.ok, status: r.status, data: await r.json() };
}
async function put(path: string, body?: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { ok: r.ok, status: r.status, data: await r.json() };
}

async function main() {
  const TODAY = new Date().toISOString().slice(0, 10);

  // Test: quick lifecycle WITHOUT the GET /ledger/account step
  // Just 12 calls: 3 GETs (dept, pm, [skip acct]) + 1 customer + employees + project + activity + participants + timesheet + supplier + orderline + order + invoice

  const [dept, pm, cust] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=id"),
    get("/employee?assignableProjectManagers=true&count=1&fields=id"),
    post("/customer", { name: "NoBankTest AS", organizationNumber: "111222333", isCustomer: true }),
  ]);
  console.log("Step 1: dept=%s pm=%s cust=%s", dept.ok, pm.ok, cust.ok);

  const deptId = dept.data.values[0].id;
  const pmAssId = pm.data.values[0].id;
  const custId = cust.data.value.id;

  const [emps, proj] = await Promise.all([
    post("/employee/list", [
      { firstName: "NoBankPM", lastName: "Test", email: "nobankpm@test.org", dateOfBirth: "1988-01-01", userType: "NO_ACCESS", department: { id: deptId } },
      { firstName: "NoBankCon", lastName: "Test", email: "nobankcon@test.org", dateOfBirth: "1992-01-01", userType: "NO_ACCESS", department: { id: deptId } },
    ]),
    post("/project", {
      name: "NoBankTest", startDate: TODAY, customer: { id: custId },
      projectManager: { id: pmAssId }, isFixedPrice: true, fixedprice: 50000,
    }),
  ]);
  console.log("Step 2: emps=%s proj=%s", emps.ok, proj.ok);

  const e1 = emps.data.values[0].id;
  const e2 = emps.data.values[1].id;
  const pId = proj.data.value.id;

  const [act] = await Promise.all([
    post("/project/projectActivity", {
      project: { id: pId }, startDate: TODAY, budgetHours: 25, budgetFeeCurrency: 50000,
      activity: { name: "Prosjektaktivitet", activityType: "PROJECT_SPECIFIC_ACTIVITY", isChargeable: false },
    }),
    post("/project/participant/list", [
      { project: { id: pId }, employee: { id: e1 }, adminAccess: true },
      { project: { id: pId }, employee: { id: e2 }, adminAccess: false },
    ]),
  ]);
  console.log("Step 3: act=%s", act.ok);
  const actId = act.data.value.activity.id;

  await Promise.all([
    post("/timesheet/entry/list", [
      { employee: { id: e1 }, project: { id: pId }, activity: { id: actId }, date: TODAY, hours: 7.5 },
      { employee: { id: e2 }, project: { id: pId }, activity: { id: actId }, date: TODAY, hours: 7.5 },
    ]),
    post("/supplier", { name: "NoBankLev AS", organizationNumber: "444555666", isSupplier: true }),
    post("/project/orderline", {
      project: { id: pId }, description: "Leverandørkostnad", date: TODAY,
      count: 1, unitCostCurrency: 10000, isChargeable: false,
    }),
  ]);
  console.log("Step 4: ok");

  const ord = await post("/order", {
    customer: { id: custId }, project: { id: pId },
    orderDate: TODAY, deliveryDate: TODAY,
    orderLines: [{ description: "NoBankTest", count: 1, unitPriceExcludingVatCurrency: 50000, vatType: { id: 3 } }],
  });
  console.log("Step 5: order=%s", ord.ok);
  const ordId = ord.data.value.id;

  // This is the critical test: does invoice creation work without us checking/fixing bank account?
  const inv = await put(`/order/${ordId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
  console.log("Step 6: invoice=%s status=%d", inv.ok, inv.status);
  if (!inv.ok) {
    console.log("  error:", JSON.stringify(inv.data).slice(0, 300));
  } else {
    console.log("  isApproved:", inv.data.value?.isApproved);
    console.log("  SUCCESS: Invoice created without bank account check!");
  }
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
