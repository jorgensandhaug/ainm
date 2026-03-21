const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "X0GxnTKvwC_2EUVm8EeRiaWxxoRkIsCIvNaNup1SXrI";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";
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
async function put(p: string, b: any) {
  const r = await fetch(`${BASE}${p}`, { method: "PUT", headers: H, body: JSON.stringify(b) });
  if (!r.ok) throw new Error(`PUT ${p} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function main() {
  // Step 1 (3 parallel): department, customer, PM
  const [deptRes, custRes, pmRes] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=*"),
    post("/customer", { name: "Nordlicht GmbH", organizationNumber: "936514200" }),
    get("/employee?assignableProjectManagers=true&count=1&fields=*"),
  ]);

  let deptId = deptRes.values?.[0]?.id;
  if (!deptId) {
    const nd = await post("/department", { name: "Avdeling" });
    deptId = nd.value.id;
  }
  const custId = custRes.value.id;
  const pmId = pmRes.values[0].id;
  console.log("S1: dept=%d cust=%d pm=%d", deptId, custId, pmId);

  // Step 2 (2 parallel): employee + project
  const [empRes, projRes] = await Promise.all([
    post("/employee", {
      firstName: "Laura",
      lastName: "Müller",
      email: "laura.muller@example.org",
      dateOfBirth: "1985-01-15",
      userType: "NO_ACCESS",
      department: { id: deptId },
    }),
    post("/project", {
      name: "Datenmigration",
      startDate: TODAY,
      customer: { id: custId },
      projectManager: { id: pmId },
      isFixedPrice: true,
      fixedprice: 31000,
    }),
  ]);
  const lauraId = empRes.value.id;
  const projId = projRes.value.id;
  console.log("S2: laura=%d proj=%d", lauraId, projId);

  // Step 3 (2 parallel): project activity + participant
  const [actRes, _partRes] = await Promise.all([
    post("/project/projectActivity", {
      project: { id: projId },
      startDate: TODAY,
      budgetHours: 20,
      budgetFeeCurrency: 31000,
      activity: {
        name: "Rådgivning",
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: false,
      },
    }),
    post("/project/participant", {
      project: { id: projId },
      employee: { id: lauraId },
      adminAccess: false,
    }),
  ]);
  const activityId = actRes.value.activity.id;
  console.log("S3: activity=%d", activityId);

  // Step 4 (3 parallel): timesheet + vatType + bank account
  const [tsRes, vatRes, accRes] = await Promise.all([
    post("/timesheet/entry/list", [
      { employee: { id: lauraId }, project: { id: projId }, activity: { id: activityId }, date: TODAY, hours: 20 },
    ]),
    get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=" + TODAY + "&fields=*"),
    get("/ledger/account?number=1920&fields=id,number,name,isBankAccount,bankAccountNumber"),
  ]);
  console.log("S4: ts=%d entries", tsRes.values.length);

  const vatId = vatRes.values[0].id;
  const bankAcc = accRes.values.find((a: any) => a.number === 1920);

  // Step 5 (conditional): bank account fix
  if (bankAcc && !bankAcc.bankAccountNumber) {
    console.log("Fixing bank account 1920");
    await put("/ledger/account/" + bankAcc.id, {
      id: bankAcc.id, number: bankAcc.number, name: bankAcc.name,
      bankAccountNumber: "12345678903",
    });
  }

  // Step 6: direct invoice
  const invRes = await post("/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: "2026-04-20",
    customer: { id: custId },
    orders: [{
      customer: { id: custId },
      project: { id: projId },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: "Rådgivning - Datenmigration (20t × 1550 NOK)",
        count: 20,
        unitPriceExcludingVatCurrency: 1550,
        vatType: { id: vatId },
      }],
    }],
  });

  console.log("Invoice: id=%d num=%s amt=%s", invRes.value.id, invRes.value.invoiceNumber, invRes.value.amountExcludingVatCurrency);
  console.log("projectInvoiceDetails:", JSON.stringify(invRes.value.projectInvoiceDetails));
  console.log("DONE — total calls: %d", bankAcc && !bankAcc.bankAccountNumber ? 12 : 11);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
