const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const TODAY = new Date().toISOString().slice(0, 10);
const FIXED_PRICE = 228150;
const MILESTONE_AMOUNT = FIXED_PRICE * 0.50; // 114075

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

// FIXTURE: Create or find a test project for sandbox verification
const FIXTURE_NAME = `Sandbox FixedPrice Verify ${Date.now()}`;

// 1. Find an existing customer in sandbox
const custData = await get("/customer?count=1&fields=*");
const cust = custData.values?.[0];
if (!cust) throw new Error("No customer in sandbox");
console.log("Customer:", cust.id, cust.name, cust.organizationNumber);

// 2. Find an assignable PM
const empData = await get("/employee?assignableProjectManagers=true&count=1&fields=*");
const emp = empData.values?.[0];
if (!emp) throw new Error("No assignable PM in sandbox");
console.log("PM:", emp.id, emp.email);

// 3. Create a test project with fixedprice=0 to simulate the update-needed branch
const projRes = await post("/project", {
  name: FIXTURE_NAME,
  startDate: TODAY,
  customer: { id: cust.id },
  projectManager: { id: emp.id },
  isFixedPrice: false,
  fixedprice: 0,
  invoiceOnAccountVatHigh: false,
});
const projId = projRes.value.id;
console.log("Created fixture project:", projId, projRes.value.name);
console.log("--- FIXTURE SETUP COMPLETE ---");

// NOW: Simulate the exact production path (measured calls start here)
let callCount = 0;

// Call 1: GET /project
callCount++;
const p1 = await get(`/project?name=${encodeURIComponent(FIXTURE_NAME)}&count=50&fields=*,customer(*),projectManager(*)`);
const found = p1.values?.find((p: any) => p.name === FIXTURE_NAME);
console.log(`[${callCount}] GET /project: id=${found.id}, fixedprice=${found.fixedprice}, isFixedPrice=${found.isFixedPrice}, pm=${found.projectManager?.email}, custOrg=${found.customer?.organizationNumber}`);

// Need PUT because fixedprice=0
// Call 2: PUT /project
callCount++;
const putRes = await put(`/project/${found.id}`, {
  id: found.id,
  name: found.name,
  startDate: found.startDate,
  customer: { id: found.customer.id },
  projectManager: { id: found.projectManager.id },
  isFixedPrice: true,
  fixedprice: FIXED_PRICE,
  invoiceOnAccountVatHigh: false,
});
console.log(`[${callCount}] PUT /project: fixedprice=${putRes.value.fixedprice}, isFixedPrice=${putRes.value.isFixedPrice}`);

// Call 3: GET VAT
callCount++;
const vatData = await get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
const vatTypes = vatData.values || [];
const vat25 = vatTypes.find((v: any) => v.percentage === 25);
const vatType = vat25 || vatTypes[0];
console.log(`[${callCount}] GET /ledger/vatType: id=${vatType.id}, ${vatType.percentage}%`);

// Call 4: POST /order
callCount++;
const orderRes = await post("/order", {
  customer: { id: found.customer.id },
  project: { id: found.id },
  orderDate: TODAY,
  deliveryDate: TODAY,
  orderLines: [{
    description: `Milestone payment 50% - ${FIXTURE_NAME}`,
    count: 1,
    unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
    vatType: { id: vatType.id },
  }],
});
const orderId = orderRes.value.id;
console.log(`[${callCount}] POST /order: id=${orderId}`);

// Call 5: GET /ledger/account (proactive hedge)
callCount++;
const bankData = await get("/ledger/account?isBankAccount=true&fields=*");
const bankAccounts = bankData.values || [];
const invoiceAccount = bankAccounts.find((a: any) => a.number === 1920);
const bankMissing = invoiceAccount && (!invoiceAccount.bankAccountNumber || invoiceAccount.bankAccountNumber.trim() === "");
console.log(`[${callCount}] GET /ledger/account: 1920 bankAccountNumber="${invoiceAccount?.bankAccountNumber || ""}" — ${bankMissing ? "MISSING" : "OK"}`);

if (bankMissing) {
  // Call 6: PUT /ledger/account (fix bank)
  callCount++;
  const fixBody = { ...invoiceAccount, bankAccountNumber: "12345678903" };
  await put(`/ledger/account/${invoiceAccount.id}`, fixBody);
  console.log(`[${callCount}] PUT /ledger/account: fixed bank number`);
}

// Call 6 or 7: PUT /order/:invoice
callCount++;
const invRes = await put(`/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
console.log(`[${callCount}] PUT /order/:invoice: id=${invRes.value?.id}, amountExcludingVatCurrency=${invRes.value?.amountExcludingVatCurrency}, amountCurrencyOutstanding=${invRes.value?.amountCurrencyOutstanding}`);

console.log(`\n--- RESULT: ${callCount} measured calls (update-needed, bank ${bankMissing ? "missing=7" : "configured=6"}) ---`);

// Now test the skip-PUT branch by re-reading
let callCount2 = 0;

// Call 1: GET /project (should now see fixedprice=228150)
callCount2++;
const p2 = await get(`/project?name=${encodeURIComponent(FIXTURE_NAME)}&count=50&fields=*,customer(*),projectManager(*)`);
const found2 = p2.values?.find((p: any) => p.name === FIXTURE_NAME);
console.log(`\n[SKIP-PUT ${callCount2}] GET /project: fixedprice=${found2.fixedprice}, isFixedPrice=${found2.isFixedPrice}`);

// fixedprice=228150 now matches, so skip PUT
// Call 2: GET VAT
callCount2++;
const vatData2 = await get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
const vatType2 = vatData2.values?.find((v: any) => v.percentage === 25) || vatData2.values?.[0];
console.log(`[SKIP-PUT ${callCount2}] GET /ledger/vatType: id=${vatType2.id}`);

// Call 3: POST /order
callCount2++;
const orderRes2 = await post("/order", {
  customer: { id: found2.customer.id },
  project: { id: found2.id },
  orderDate: TODAY,
  deliveryDate: TODAY,
  orderLines: [{
    description: `Milestone payment 50% - ${FIXTURE_NAME} (skip-PUT)`,
    count: 1,
    unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
    vatType: { id: vatType2.id },
  }],
});
const orderId2 = orderRes2.value.id;
console.log(`[SKIP-PUT ${callCount2}] POST /order: id=${orderId2}`);

// Call 4: PUT /order/:invoice (no bank check on skip-PUT branch)
callCount2++;
const invRes2 = await put(`/order/${orderId2}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
console.log(`[SKIP-PUT ${callCount2}] PUT /order/:invoice: id=${invRes2.value?.id}, amountExcludingVatCurrency=${invRes2.value?.amountExcludingVatCurrency}`);

console.log(`\n--- RESULT: ${callCount2} measured calls (skip-PUT branch) ---`);
console.log(`\nMilestone amount: ${MILESTONE_AMOUNT} (228150 * 0.50 = 114075)`);
