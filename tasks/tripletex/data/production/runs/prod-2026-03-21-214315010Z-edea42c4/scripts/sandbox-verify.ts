// Sandbox verification: set up fixture and verify the update-needed + proactive hedge path
// mirrors the production task shape: fixed-price + 75% milestone
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const FIXED_PRICE = 326550;
const MILESTONE_PCT = 0.75;
const MILESTONE_AMOUNT = FIXED_PRICE * MILESTONE_PCT; // 244912.5
const TODAY = "2026-03-21";
const FIXTURE_ID = crypto.randomUUID().slice(0, 8);

let callCount = 0;
let errorCount = 0;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  callCount++;
  console.log(`[${callCount}] ${method} ${url}`);
  const r = await fetch(url, opts);
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`  -> ${r.status}`, JSON.stringify(data).slice(0, 400));
  if (!r.ok) {
    errorCount++;
    throw new Error(`${r.status} ${method} ${path}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  console.log("=== FIXTURE SETUP (not counted) ===");
  callCount = 0;

  // Find an assignable PM
  const pmRes = await api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*");
  const pm = pmRes.values[0];
  console.log(`PM: ${pm.firstName} ${pm.lastName} (id=${pm.id}, email=${pm.email})`);

  // Create a customer
  const custRes = await api("POST", "/customer", {
    name: `Cascade Sandbox ${FIXTURE_ID}`,
    organizationNumber: "813648164",
    invoiceSendMethod: "MANUAL",
  });
  const customerId = custRes.value.id;
  console.log(`Customer: id=${customerId}`);

  // Create a project with fixedprice=0 (to simulate update-needed)
  const projRes = await api("POST", "/project", {
    name: `Projet d'automatisation ${FIXTURE_ID}`,
    startDate: "2026-01-01",
    customer: { id: customerId },
    projectManager: { id: pm.id },
    isFixedPrice: false,
    fixedprice: 0,
    invoiceOnAccountVatHigh: false,
  });
  const projectId = projRes.value.id;
  const projectName = projRes.value.name;
  console.log(`Project: id=${projectId}, name="${projectName}"`);

  console.log("\n=== MEASURED PROOF: update-needed proactive hedge ===");
  callCount = 0;
  errorCount = 0;

  // Step 1: Decisive project read
  const readRes = await api("GET", `/project?name=${encodeURIComponent(projectName)}&count=50&fields=*,customer(*),projectManager(*)`);
  const proj = (readRes.values || []).find((p: any) => p.name === projectName);
  if (!proj) throw new Error("Project not found");
  console.log(`  Found project: fixedprice=${proj.fixedprice}, isFixedPrice=${proj.isFixedPrice}`);
  console.log(`  Customer org: ${proj.customer?.organizationNumber}`);
  console.log(`  PM email: ${proj.projectManager?.email}`);

  // Step 2: PUT project (update-needed)
  await api("PUT", `/project/${projectId}`, {
    id: projectId,
    name: projectName,
    startDate: proj.startDate,
    customer: { id: proj.customer.id },
    projectManager: { id: proj.projectManager.id },
    isFixedPrice: true,
    fixedprice: FIXED_PRICE,
    invoiceOnAccountVatHigh: false,
  });

  // Step 3: GET VAT type
  const vatRes = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
  const vatValues = vatRes.values || [];
  let vatType = vatValues.find((v: any) => v.percentage === 25);
  if (!vatType) vatType = vatValues[0];
  console.log(`  VAT: id=${vatType.id}, percentage=${vatType.percentage}%`);

  // Step 4: POST order
  const orderRes = await api("POST", "/order", {
    customer: { id: proj.customer.id },
    project: { id: projectId },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [{
      description: `Paiement d'étape - 75% du prix fixe`,
      count: 1,
      unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
      vatType: { id: vatType.id },
    }],
  });
  const orderId = orderRes.value.id;

  // Step 5: Proactive bank account check
  const acctRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
  const accts = acctRes.values || [];
  const invoiceAcct = accts.find((a: any) => a.number === 1920) || accts[0];
  console.log(`  Bank account 1920: bankAccountNumber=${invoiceAcct?.bankAccountNumber || '(empty)'}`);
  if (invoiceAcct && !invoiceAcct.bankAccountNumber) {
    await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
      id: invoiceAcct.id,
      number: invoiceAcct.number,
      name: invoiceAcct.name,
      bankAccountNumber: "12345678903",
    });
  }

  // Step 6: Invoice
  const invRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);

  console.log(`\n=== RESULTS ===`);
  console.log(`Measured calls: ${callCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Invoice ID: ${invRes.value?.id}`);
  console.log(`Amount excl VAT: ${invRes.value?.amountExcludingVatCurrency}`);
  console.log(`Amount outstanding: ${invRes.value?.amountCurrencyOutstanding}`);
  console.log(`Expected milestone: ${MILESTONE_AMOUNT}`);
  console.log(`Match: ${invRes.value?.amountExcludingVatCurrency === MILESTONE_AMOUNT}`);

  // Now test skip-PUT branch: re-read the project (now updated) and verify 4-call path
  console.log("\n=== MEASURED PROOF: skip-PUT branch (same project, now updated) ===");
  callCount = 0;
  errorCount = 0;

  // Step 1: Project read (should show fixedprice=326550 now)
  const readRes2 = await api("GET", `/project?name=${encodeURIComponent(projectName)}&count=50&fields=*,customer(*),projectManager(*)`);
  const proj2 = (readRes2.values || []).find((p: any) => p.name === projectName);
  console.log(`  fixedprice=${proj2.fixedprice}, isFixedPrice=${proj2.isFixedPrice}`);
  const skipPut = proj2.fixedprice === FIXED_PRICE && proj2.isFixedPrice === true;
  console.log(`  Skip PUT: ${skipPut}`);

  // Step 2: GET VAT type
  const vatRes2 = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
  const vat2 = (vatRes2.values || []).find((v: any) => v.percentage === 25) || vatRes2.values[0];

  // Step 3: POST order
  const orderRes2 = await api("POST", "/order", {
    customer: { id: proj2.customer.id },
    project: { id: projectId },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [{
      description: `Paiement d'étape - 75% du prix fixe (skip-PUT proof)`,
      count: 1,
      unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
      vatType: { id: vat2.id },
    }],
  });

  // Step 4: Invoice (no bank check on skip-PUT branch)
  const invRes2 = await api("PUT", `/order/${orderRes2.value.id}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);

  console.log(`\n=== SKIP-PUT RESULTS ===`);
  console.log(`Measured calls: ${callCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Invoice ID: ${invRes2.value?.id}`);
  console.log(`Amount excl VAT: ${invRes2.value?.amountExcludingVatCurrency}`);
  console.log(`Expected: ${MILESTONE_AMOUNT}`);
  console.log(`Match: ${invRes2.value?.amountExcludingVatCurrency === MILESTONE_AMOUNT}`);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
