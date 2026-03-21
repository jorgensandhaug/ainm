const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

const PROJECT_NAME = "Migração para nuvem";
const CUSTOMER_ORG = "922471126";
const MANAGER_EMAIL = "leonor.sousa@example.org";
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
  if (typeof data === "object") {
    // Print compact summary
    if (data.values) {
      console.log(`  values count: ${data.values.length}`);
      for (const v of data.values) {
        const summary: any = { id: v.id, name: v.name };
        if (v.fixedprice !== undefined) summary.fixedprice = v.fixedprice;
        if (v.isFixedPrice !== undefined) summary.isFixedPrice = v.isFixedPrice;
        if (v.organizationNumber) summary.orgNr = v.organizationNumber;
        if (v.email) summary.email = v.email;
        if (v.percentage !== undefined) summary.percentage = v.percentage;
        if (v.number !== undefined) summary.number = v.number;
        if (v.bankAccountNumber !== undefined) summary.bankAccountNumber = v.bankAccountNumber;
        if (v.customer) summary.customer = { id: v.customer.id, orgNr: v.customer.organizationNumber };
        if (v.projectManager) summary.pm = { id: v.projectManager.id, email: v.projectManager.email };
        if (v.startDate) summary.startDate = v.startDate;
        console.log(`  -> ${JSON.stringify(summary)}`);
      }
    } else if (data.value) {
      const v = data.value;
      const summary: any = { id: v.id };
      if (v.fixedprice !== undefined) summary.fixedprice = v.fixedprice;
      if (v.isFixedPrice !== undefined) summary.isFixedPrice = v.isFixedPrice;
      if (v.amountExcludingVatCurrency !== undefined) summary.amountExVat = v.amountExcludingVatCurrency;
      if (v.amountCurrencyOutstanding !== undefined) summary.outstanding = v.amountCurrencyOutstanding;
      console.log(`  -> ${JSON.stringify(summary)}`);
    }
  }
  if (!res.ok) {
    console.log(JSON.stringify(data, null, 2));
    throw new Error(`${res.status} on ${method} ${path}`);
  }
  return data;
}

async function main() {
  console.log("=== SANDBOX VERIFICATION: skip-PUT-project branch ===");
  console.log(`Testing whether project already has fixedprice=${FIXED_PRICE}`);
  console.log();

  // Step 1: Project-first resolver
  const projRes = await api("GET", `/project?name=${encodeURIComponent(PROJECT_NAME)}&count=50&fields=*,customer(*),projectManager(*)`);

  const projects = projRes.values || [];
  const proj = projects.find((p: any) => p.name === PROJECT_NAME && p.customer?.organizationNumber === CUSTOMER_ORG);

  if (!proj) {
    console.log("ERROR: Project not found");
    return;
  }

  console.log(`\n  Project state: fixedprice=${proj.fixedprice}, isFixedPrice=${proj.isFixedPrice}`);
  console.log(`  Customer: ${proj.customer?.name} (${proj.customer?.organizationNumber})`);
  console.log(`  Manager: ${proj.projectManager?.email}`);

  const managerMatches = proj.projectManager?.email === MANAGER_EMAIL;
  const projectAlreadyCorrect = proj.fixedprice === FIXED_PRICE && proj.isFixedPrice === true && managerMatches;

  if (projectAlreadyCorrect) {
    console.log("\n  >>> SKIP-PUT branch: project already has target state");
    console.log("  >>> Expected path: GET /project -> GET /vatType -> POST /order -> PUT /order/:invoice (4 calls)");
  } else {
    console.log(`\n  >>> UPDATE-NEEDED branch: fixedprice=${proj.fixedprice} vs target=${FIXED_PRICE}, isFixedPrice=${proj.isFixedPrice}, managerMatch=${managerMatches}`);
    console.log("  >>> Expected path: 6 calls (proactive hedge, bank configured) or 7 calls (bank missing)");
  }

  // Step 2: GET /ledger/vatType
  const vatRes = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
  const vatTypes = vatRes.values || [];
  let vatType = vatTypes.find((v: any) => v.percentage === 25);
  if (!vatType) vatType = vatTypes[0];
  console.log(`\n  Using VAT: id=${vatType.id}, percentage=${vatType.percentage}%`);

  // Step 3: POST /order
  const orderRes = await api("POST", "/order", {
    customer: { id: proj.customer.id },
    project: { id: proj.id },
    orderDate: TODAY,
    deliveryDate: TODAY,
    invoiceOnAccountVatHigh: false,
    orderLines: [
      {
        description: "Milestone payment 50% of fixed price",
        count: 1,
        unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
        vatType: { id: vatType.id },
      },
    ],
  });
  const orderId = orderRes.value.id;

  // Step 4: On skip-PUT branch, go straight to invoice (no proactive hedge)
  if (projectAlreadyCorrect) {
    console.log("\n  Skip-PUT branch: skipping proactive /ledger/account check");
  }

  // Step 5: Invoice
  const invRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);

  console.log(`\n=== RESULT ===`);
  console.log(`Total calls: ${callCount}`);
  console.log(`Invoice id: ${invRes.value.id}`);
  console.log(`amountExcludingVatCurrency: ${invRes.value.amountExcludingVatCurrency}`);
  console.log(`amountCurrencyOutstanding: ${invRes.value.amountCurrencyOutstanding}`);
  console.log(`Expected milestone amount: ${MILESTONE_AMOUNT}`);
  console.log(`Match: ${invRes.value.amountExcludingVatCurrency === MILESTONE_AMOUNT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
