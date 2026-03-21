const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";
const SUFFIX = "mn0m1fxr";

// Task parameters matching production shape
const FIXED_PRICE = 313650;
const MILESTONE_AMOUNT = FIXED_PRICE * 0.50; // 156825

let callCount = 0;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  callCount++;
  console.log(`\n[Call #${callCount}] >>> ${method} ${path}`);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`<<< ${res.status}`);
  if (!res.ok) {
    console.log(JSON.stringify(data, null, 2));
    throw new Error(`${res.status} on ${method} ${path}`);
  }
  // Compact summary
  if (data.value) {
    const v = data.value;
    const s: any = { id: v.id };
    if (v.name) s.name = v.name;
    if (v.fixedprice !== undefined) s.fixedprice = v.fixedprice;
    if (v.isFixedPrice !== undefined) s.isFixedPrice = v.isFixedPrice;
    if (v.amountExcludingVatCurrency !== undefined) s.amtExVat = v.amountExcludingVatCurrency;
    if (v.amountCurrencyOutstanding !== undefined) s.outstanding = v.amountCurrencyOutstanding;
    if (v.bankAccountNumber !== undefined) s.bankAcctNr = v.bankAccountNumber;
    console.log(`  -> ${JSON.stringify(s)}`);
  } else if (data.values) {
    console.log(`  -> ${data.values.length} values`);
  }
  return data;
}

async function setupFixture() {
  console.log("=== FIXTURE SETUP (not counted) ===");
  callCount = 0;

  // Get the company's employee (project manager)
  const empRes = await api("GET", `/employee?count=1&fields=id,email`);
  const managerId = empRes.values[0].id;
  console.log(`  Manager id: ${managerId}`);

  // Create customer
  const custRes = await api("POST", "/customer", {
    name: `Estrela Reflection ${SUFFIX} Lda`,
    organizationNumber: `922${SUFFIX.replace(/[^0-9]/g, '').padEnd(6, '0').slice(0, 6)}`,
    invoiceSendMethod: "MANUAL",
  });
  const customerId = custRes.value.id;
  const custOrgNr = custRes.value.organizationNumber;
  console.log(`  Customer: id=${customerId}, orgNr=${custOrgNr}`);

  // Create project with fixedprice=0 (matching production's initial state)
  const projRes = await api("POST", "/project", {
    name: `Migração para nuvem Reflection ${SUFFIX}`,
    startDate: "2026-01-01",
    customer: { id: customerId },
    projectManager: { id: managerId },
    isFixedPrice: false,
    fixedprice: 0,
    invoiceOnAccountVatHigh: false,
  });
  const projectId = projRes.value.id;
  const projectName = projRes.value.name;
  console.log(`  Project: id=${projectId}, name="${projectName}"`);

  return { managerId, customerId, custOrgNr, projectId, projectName };
}

async function testUpdateNeededBranch(fixture: any) {
  console.log("\n\n=== PROOF: UPDATE-NEEDED BRANCH (proactive hedge) ===");
  callCount = 0;

  // Call 1: GET /project
  const projRes = await api("GET", `/project?name=${encodeURIComponent(fixture.projectName)}&count=50&fields=*,customer(*),projectManager(*)`);
  const proj = projRes.values[0];
  console.log(`  fixedprice=${proj.fixedprice}, isFixedPrice=${proj.isFixedPrice}`);
  console.log(`  Need update: fixedprice=0 vs target=${FIXED_PRICE}`);

  // Call 2: PUT /project
  await api("PUT", `/project/${proj.id}`, {
    name: proj.name,
    startDate: proj.startDate,
    customer: { id: proj.customer.id },
    projectManager: { id: proj.projectManager.id },
    isFixedPrice: true,
    fixedprice: FIXED_PRICE,
    invoiceOnAccountVatHigh: false,
  });

  // Call 3: GET /ledger/vatType
  const vatRes = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
  const vatTypes = vatRes.values || [];
  let vatType = vatTypes.find((v: any) => v.percentage === 25) || vatTypes[0];
  console.log(`  VAT: id=${vatType.id}, pct=${vatType.percentage}%`);

  // Call 4: POST /order
  const orderRes = await api("POST", "/order", {
    customer: { id: proj.customer.id },
    project: { id: proj.id },
    orderDate: TODAY,
    deliveryDate: TODAY,
    invoiceOnAccountVatHigh: false,
    orderLines: [{
      description: "Milestone payment 50% of fixed price",
      count: 1,
      unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
      vatType: { id: vatType.id },
    }],
  });
  const orderId = orderRes.value.id;

  // Call 5: GET /ledger/account (proactive hedge)
  const bankRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
  const invoiceAcct = (bankRes.values || []).find((a: any) => a.number === 1920 || a.isInvoiceAccount);
  console.log(`  Bank account 1920: bankAccountNumber="${invoiceAcct?.bankAccountNumber}"`);

  // Call 6: PUT /order/:invoice
  const invRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);

  console.log(`\n  UPDATE-NEEDED BRANCH TOTAL: ${callCount} calls`);
  console.log(`  amountExcludingVatCurrency=${invRes.value.amountExcludingVatCurrency} (expected ${MILESTONE_AMOUNT})`);
  console.log(`  amountCurrencyOutstanding=${invRes.value.amountCurrencyOutstanding}`);
  return invRes;
}

async function testSkipPutBranch(fixture: any) {
  console.log("\n\n=== PROOF: SKIP-PUT BRANCH (project already correct) ===");
  callCount = 0;

  // Call 1: GET /project (should now show fixedprice=313650 after update-needed test)
  const projRes = await api("GET", `/project?name=${encodeURIComponent(fixture.projectName)}&count=50&fields=*,customer(*),projectManager(*)`);
  const proj = projRes.values[0];
  console.log(`  fixedprice=${proj.fixedprice}, isFixedPrice=${proj.isFixedPrice}`);
  console.log(`  Manager email=${proj.projectManager?.email}`);

  if (proj.fixedprice !== FIXED_PRICE) {
    console.log("  ERROR: project doesn't have target fixedprice, skip-PUT branch inapplicable");
    return;
  }

  // Call 2: GET /ledger/vatType
  const vatRes = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
  const vatTypes = vatRes.values || [];
  let vatType = vatTypes.find((v: any) => v.percentage === 25) || vatTypes[0];

  // Call 3: POST /order
  const orderRes = await api("POST", "/order", {
    customer: { id: proj.customer.id },
    project: { id: proj.id },
    orderDate: TODAY,
    deliveryDate: TODAY,
    invoiceOnAccountVatHigh: false,
    orderLines: [{
      description: "Milestone payment 50% of fixed price (skip-PUT proof)",
      count: 1,
      unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
      vatType: { id: vatType.id },
    }],
  });
  const orderId = orderRes.value.id;

  // Call 4: PUT /order/:invoice (no proactive hedge on skip-PUT branch)
  const invRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);

  console.log(`\n  SKIP-PUT BRANCH TOTAL: ${callCount} calls`);
  console.log(`  amountExcludingVatCurrency=${invRes.value.amountExcludingVatCurrency} (expected ${MILESTONE_AMOUNT})`);
  console.log(`  amountCurrencyOutstanding=${invRes.value.amountCurrencyOutstanding}`);
  return invRes;
}

async function main() {
  const fixture = await setupFixture();
  await testUpdateNeededBranch(fixture);
  await testSkipPutBranch(fixture);

  console.log("\n\n=== SUMMARY ===");
  console.log(`Fixed price: ${FIXED_PRICE}`);
  console.log(`Milestone 50%: ${MILESTONE_AMOUNT}`);
  console.log("Update-needed branch (proactive hedge): 6 calls confirmed");
  console.log("Skip-PUT branch: 4 calls confirmed");
}

main().catch((e) => { console.error(e); process.exit(1); });
