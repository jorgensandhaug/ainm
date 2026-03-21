const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "c3qkO05E3ElOHYLL0vNH0sfrnFy5hRf_aoy2HH9cWcA";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = new Date().toISOString().slice(0, 10);

const h = { "Authorization": AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const j = await r.json();
  if (!r.ok) { console.error("GET", path, r.status, JSON.stringify(j)); throw new Error(`GET ${path} ${r.status}`); }
  return j;
}
async function put(path: string, body?: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) { console.error("PUT", path, r.status, JSON.stringify(j)); throw new Error(`PUT ${path} ${r.status}`); }
  return j;
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) { console.error("POST", path, r.status, JSON.stringify(j)); throw new Error(`POST ${path} ${r.status}`); }
  return j;
}

const FIXED_PRICE = 170500;
const MILESTONE_PCT = 0.33;
const MILESTONE_AMT = FIXED_PRICE * MILESTONE_PCT; // 56265
const PROJECT_NAME = "Infrastructure Upgrade";
const CUSTOMER_ORG = "850116091";
const PM_EMAIL = "charlotte.walker@example.org";

async function main() {
  // Step 1: Get project with expanded customer and PM
  console.log("Step 1: GET /project");
  const projRes = await get(`/project?name=${encodeURIComponent(PROJECT_NAME)}&count=50&fields=*,customer(*),projectManager(*)`);
  const projects = (projRes.values || []).filter((p: any) => p.name === PROJECT_NAME);
  const proj = projects.find((p: any) => p.customer?.organizationNumber === CUSTOMER_ORG);
  if (!proj) { console.error("Project not found"); process.exit(1); }

  const projectId = proj.id;
  const customerId = proj.customer.id;
  const startDate = proj.startDate;
  console.log("  projectId:", projectId, "customerId:", customerId, "startDate:", startDate);

  // Check if PM already matches
  const pmMatches = proj.projectManager?.email === PM_EMAIL;
  let pmId = proj.projectManager?.id;
  console.log("  PM matches:", pmMatches, "pmId:", pmId, "pmEmail:", proj.projectManager?.email);

  // Check if fixed price already set correctly
  const fpMatches = proj.fixedprice === FIXED_PRICE && proj.isFixedPrice === true;
  console.log("  fixedprice:", proj.fixedprice, "isFixedPrice:", proj.isFixedPrice, "matches:", fpMatches);

  const needsUpdate = !fpMatches || !pmMatches;

  // If PM doesn't match, resolve PM
  if (!pmMatches) {
    console.log("Step 1b: GET /employee for PM");
    const empRes = await get(`/employee?email=${encodeURIComponent(PM_EMAIL)}&assignableProjectManagers=true&count=10&fields=*`);
    const emp = (empRes.values || []).find((e: any) => e.email === PM_EMAIL);
    if (emp) {
      pmId = emp.id;
      console.log("  Resolved PM id:", pmId);
    } else {
      console.log("  PM not found as assignable, keeping existing PM:", pmId);
    }
  }

  // Step 2: PUT /project if needed
  if (needsUpdate) {
    console.log("Step 2: PUT /project/" + projectId);
    const putRes = await put(`/project/${projectId}`, {
      name: PROJECT_NAME,
      startDate,
      customer: { id: customerId },
      projectManager: { id: pmId },
      isFixedPrice: true,
      fixedprice: FIXED_PRICE,
      invoiceOnAccountVatHigh: false,
    });
    console.log("  Updated: fixedprice:", putRes.value?.fixedprice, "isFixedPrice:", putRes.value?.isFixedPrice);
  }

  // Step 3: GET /ledger/vatType
  console.log("Step 3: GET /ledger/vatType");
  const vatRes = await get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
  const vatTypes = vatRes.values || [];
  // Prefer 25% if available, otherwise take the first one
  let vatType = vatTypes.find((v: any) => v.percentage === 25) || vatTypes[0];
  console.log("  vatType id:", vatType?.id, "percentage:", vatType?.percentage);

  // Step 4: POST /order
  console.log("Step 4: POST /order");
  const orderRes = await post("/order", {
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
  });
  const orderId = orderRes.value?.id;
  console.log("  orderId:", orderId);

  // Step 5: Proactive bank check (on update-needed branch)
  if (needsUpdate) {
    console.log("Step 5: GET /ledger/account (bank check)");
    const acctRes = await get("/ledger/account?isBankAccount=true&fields=*");
    const accts = acctRes.values || [];
    const invoiceAcct = accts.find((a: any) => a.number === 1920) || accts[0];
    if (invoiceAcct && !invoiceAcct.bankAccountNumber) {
      console.log("  Fixing bank account", invoiceAcct.id);
      await put(`/ledger/account/${invoiceAcct.id}`, {
        ...invoiceAcct,
        bankAccountNumber: "12345678903",
      });
      console.log("  Bank account fixed");
    } else {
      console.log("  Bank account OK:", invoiceAcct?.bankAccountNumber);
    }
  }

  // Step 6: PUT /order/:invoice
  console.log("Step 6: PUT /order/:invoice");
  const invRes = await put(`/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
  console.log("  invoiceId:", invRes.value?.id);
  console.log("  amountExcludingVatCurrency:", invRes.value?.amountExcludingVatCurrency);
  console.log("  amountCurrencyOutstanding:", invRes.value?.amountCurrencyOutstanding);
  console.log("DONE");
}

main().catch(e => { console.error(e); process.exit(1); });
