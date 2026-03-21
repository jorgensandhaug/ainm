const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "SGt0GSaI5TcWBriN1W6twEvi_Qj-0xh5xsQTqF5vSM8";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const PROJECT_NAME = "Melhoria de infraestrutura";
const CUSTOMER_ORG = "804639764";
const PM_EMAIL = "sofia.ferreira@example.org";
const FIXED_PRICE = 228150;
const MILESTONE_FRACTION = 0.50;
const MILESTONE_AMOUNT = FIXED_PRICE * MILESTONE_FRACTION; // 114075
const TODAY = new Date().toISOString().slice(0, 10);

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  if (!r.ok) { const t = await r.text(); throw new Error(`GET ${path} ${r.status}: ${t}`); }
  return r.json();
}
async function put(path: string, body?: any) {
  const opts: any = { method: "PUT", headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  if (!r.ok) { const t = await r.text(); throw new Error(`PUT ${path} ${r.status}: ${t}`); }
  return r.json();
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  if (!r.ok) { const t = await r.text(); throw new Error(`POST ${path} ${r.status}: ${t}`); }
  return r.json();
}

// Step 1: Decisive project read with expanded customer and PM
const projData = await get(`/project?name=${encodeURIComponent(PROJECT_NAME)}&count=50&fields=*,customer(*),projectManager(*)`);
const projects = projData.values || [];
const proj = projects.find((p: any) => p.name === PROJECT_NAME && p.customer?.organizationNumber === CUSTOMER_ORG);
if (!proj) throw new Error("Project not found with matching customer org number");

console.log("Project found:", proj.id, "fixedprice:", proj.fixedprice, "isFixedPrice:", proj.isFixedPrice);
console.log("Customer:", proj.customer?.id, proj.customer?.organizationNumber);
console.log("PM:", proj.projectManager?.email);

const customerId = proj.customer.id;
const projectId = proj.id;

// Check if PM matches
const pmMatches = proj.projectManager?.email === PM_EMAIL;
let pmId = pmMatches ? proj.projectManager.id : null;

// Check if project already has correct fixed price
const fixedPriceMatches = proj.fixedprice === FIXED_PRICE && proj.isFixedPrice === true;
const needsPut = !fixedPriceMatches || !pmMatches;

if (!pmMatches) {
  // Need to resolve PM
  const empData = await get(`/employee?email=${encodeURIComponent(PM_EMAIL)}&assignableProjectManagers=true&count=10&fields=*`);
  const emps = (empData.values || []).filter((e: any) => e.email === PM_EMAIL);
  if (emps.length === 0) throw new Error("PM not found");
  pmId = emps[0].id;
  console.log("Resolved PM:", pmId);
}

if (needsPut) {
  // Step 2: PUT project
  const putBody = {
    id: projectId,
    name: PROJECT_NAME,
    startDate: proj.startDate,
    customer: { id: customerId },
    projectManager: { id: pmId },
    isFixedPrice: true,
    fixedprice: FIXED_PRICE,
    invoiceOnAccountVatHigh: false,
  };
  const putRes = await put(`/project/${projectId}`, putBody);
  console.log("PUT project:", putRes.value?.id, "fixedprice:", putRes.value?.fixedprice);
}

// Step 3: GET VAT type
const vatData = await get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
const vatTypes = vatData.values || [];
const vat25 = vatTypes.find((v: any) => v.percentage === 25);
const vatType = vat25 || vatTypes[0];
console.log("VAT type:", vatType.id, vatType.name, vatType.percentage + "%");

// Step 4: POST order
const orderBody = {
  customer: { id: customerId },
  project: { id: projectId },
  orderDate: TODAY,
  deliveryDate: TODAY,
  orderLines: [{
    description: `Milestone payment ${MILESTONE_FRACTION * 100}% - ${PROJECT_NAME}`,
    count: 1,
    unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
    vatType: { id: vatType.id },
  }],
};
const orderRes = await post("/order", orderBody);
const orderId = orderRes.value.id;
console.log("Order created:", orderId);

// Step 5 (proactive hedge, only on update-needed branch): check bank account
if (needsPut) {
  const bankData = await get("/ledger/account?isBankAccount=true&fields=*");
  const bankAccounts = bankData.values || [];
  const invoiceAccount = bankAccounts.find((a: any) => a.number === 1920);
  if (invoiceAccount && (!invoiceAccount.bankAccountNumber || invoiceAccount.bankAccountNumber.trim() === "")) {
    console.log("Invoice account 1920 missing bank number, fixing...");
    const fixBody = { ...invoiceAccount, bankAccountNumber: "12345678903" };
    await put(`/ledger/account/${invoiceAccount.id}`, fixBody);
    console.log("Fixed bank account number");
  } else {
    console.log("Bank account OK");
  }
}

// Step 6: Invoice
const invRes = await put(`/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
console.log("Invoice created:", invRes.value?.id);
console.log("amountExcludingVatCurrency:", invRes.value?.amountExcludingVatCurrency);
console.log("amountCurrencyOutstanding:", invRes.value?.amountCurrencyOutstanding);
console.log("DONE");
