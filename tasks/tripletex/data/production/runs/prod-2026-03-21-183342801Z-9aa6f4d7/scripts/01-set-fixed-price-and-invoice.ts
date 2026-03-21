const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "Hx9i9PYh1XUxXVMf_vlnqCbeslRSNqVizfM0sF3KIiU";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const HEADERS = { Authorization: AUTH, "Content-Type": "application/json" };

const PROJECT_NAME = "Skymigrering";
const CUSTOMER_ORG = "957353681";
const MANAGER_EMAIL = "magnus.haugen@example.org";
const FIXED_PRICE = 178450;
const PARTIAL_FRACTION = 0.50;
const PARTIAL_AMOUNT = FIXED_PRICE * PARTIAL_FRACTION; // 89225
const TODAY = "2026-03-21";

async function get(path: string) {
  const url = `${BASE}${path}`;
  console.log(`GET ${url}`);
  const r = await fetch(url, { headers: HEADERS });
  const body = await r.json();
  console.log(`  status=${r.status} count=${body.count ?? "n/a"}`);
  if (!r.ok) { console.log(JSON.stringify(body, null, 2)); throw new Error(`GET failed ${r.status}`); }
  return body;
}

async function put(path: string, payload?: any) {
  const url = `${BASE}${path}`;
  console.log(`PUT ${url}`);
  const r = await fetch(url, {
    method: "PUT",
    headers: HEADERS,
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
  });
  const body = await r.json();
  console.log(`  status=${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(body, null, 2)); throw new Error(`PUT failed ${r.status}`); }
  return body;
}

async function post(path: string, payload: any) {
  const url = `${BASE}${path}`;
  console.log(`POST ${url}`);
  const r = await fetch(url, { method: "POST", headers: HEADERS, body: JSON.stringify(payload) });
  const body = await r.json();
  console.log(`  status=${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(body, null, 2)); throw new Error(`POST failed ${r.status}`); }
  return body;
}

async function main() {
  // Step 1: Decisive project-first resolver
  const projData = await get(`/project?name=${encodeURIComponent(PROJECT_NAME)}&count=50&fields=*,customer(*),projectManager(*)`);

  // Find exact project match with matching customer org number
  const projects = projData.values ?? [];
  const match = projects.find((p: any) =>
    p.name === PROJECT_NAME && p.customer?.organizationNumber === CUSTOMER_ORG
  );

  let projectId: number;
  let customerId: number;
  let managerId: number;
  let needsPut = true;
  let startDate: string;

  if (match) {
    projectId = match.id;
    customerId = match.customer.id;
    startDate = match.startDate;

    // Check if manager already matches
    if (match.projectManager?.email === MANAGER_EMAIL) {
      managerId = match.projectManager.id;
    } else {
      // Resolve manager separately
      const empData = await get(`/employee?email=${encodeURIComponent(MANAGER_EMAIL)}&assignableProjectManagers=true&count=10&fields=*`);
      const emp = (empData.values ?? []).find((e: any) => e.email === MANAGER_EMAIL);
      if (!emp) throw new Error("Manager not found");
      managerId = emp.id;
    }

    // Check if PUT can be skipped
    if (match.fixedprice === FIXED_PRICE && match.isFixedPrice === true && match.projectManager?.email === MANAGER_EMAIL) {
      needsPut = false;
      console.log("  Project already has correct fixed price and manager — skipping PUT /project");
    }
  } else {
    // Need to resolve customer and manager, then create project
    const custData = await get(`/customer?organizationNumber=${CUSTOMER_ORG}&count=10&fields=*`);
    const cust = (custData.values ?? []).find((c: any) => c.organizationNumber === CUSTOMER_ORG);
    if (!cust) throw new Error("Customer not found by org number");
    customerId = cust.id;

    const empData = await get(`/employee?email=${encodeURIComponent(MANAGER_EMAIL)}&assignableProjectManagers=true&count=10&fields=*`);
    const emp = (empData.values ?? []).find((e: any) => e.email === MANAGER_EMAIL);
    if (!emp) throw new Error("Manager not found");
    managerId = emp.id;

    startDate = TODAY;

    // Create project
    const projCreate = await post("/project", {
      name: PROJECT_NAME,
      startDate,
      customer: { id: customerId },
      projectManager: { id: managerId },
      isFixedPrice: true,
      fixedprice: FIXED_PRICE,
      invoiceOnAccountVatHigh: false,
    });
    projectId = projCreate.value.id;
    needsPut = false;
  }

  // Step 6: PUT /project if needed
  if (needsPut) {
    const putResult = await put(`/project/${projectId}`, {
      id: projectId,
      name: PROJECT_NAME,
      startDate,
      customer: { id: customerId },
      projectManager: { id: managerId },
      isFixedPrice: true,
      fixedprice: FIXED_PRICE,
      invoiceOnAccountVatHigh: false,
    });
    console.log(`  Updated project ${projectId}: fixedprice=${putResult.value.fixedprice}, isFixedPrice=${putResult.value.isFixedPrice}`);
  }

  // Step 7: GET VAT type
  const vatData = await get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
  const vatValues = vatData.values ?? [];
  // Prefer 25% if available, else use whatever is available
  const vat25 = vatValues.find((v: any) => v.percentage === 25);
  const vatType = vat25 ?? vatValues[0];
  if (!vatType) throw new Error("No outgoing VAT type found");
  console.log(`  Using VAT: id=${vatType.id} percentage=${vatType.percentage}%`);

  // Step 8: POST /order
  const orderResult = await post("/order", {
    customer: { id: customerId },
    project: { id: projectId },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [{
      description: `Delbetaling 50% fastpris – ${PROJECT_NAME}`,
      count: 1,
      unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
      vatType: { id: vatType.id },
    }],
  });
  const orderId = orderResult.value.id;
  console.log(`  Created order ${orderId}`);

  // Step 9: Proactive bank account check (only on update-needed branch)
  if (needsPut) {
    const acctData = await get("/ledger/account?isBankAccount=true&fields=*");
    const accts = acctData.values ?? [];
    const invoiceAcct = accts.find((a: any) => a.number === 1920);
    if (invoiceAcct && (!invoiceAcct.bankAccountNumber || invoiceAcct.bankAccountNumber.trim() === "")) {
      console.log(`  Invoice account 1920 (id=${invoiceAcct.id}) missing bank number — fixing`);
      await put(`/ledger/account/${invoiceAcct.id}`, {
        ...invoiceAcct,
        bankAccountNumber: "12345678903",
      });
    }
  }

  // Step 10: PUT /order/:invoice
  const invoiceResult = await put(`/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
  const inv = invoiceResult.value;
  console.log(`  Invoice created: id=${inv.id} amountExcludingVat=${inv.amountExcludingVatCurrency} outstanding=${inv.amountCurrencyOutstanding}`);

  console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });
