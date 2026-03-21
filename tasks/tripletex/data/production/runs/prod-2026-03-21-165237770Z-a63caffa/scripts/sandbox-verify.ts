const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`\n>>> ${method} ${url}`);
  if (body) console.log("BODY:", JSON.stringify(body, null, 2));
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`<<< ${res.status}`);
  if (!res.ok) console.log(JSON.stringify(data, null, 2));
  return { status: res.status, data };
}

async function main() {
  // Step 1: Check current bank account state
  console.log("=== CHECKING BANK ACCOUNT STATE ===");
  const acctRes = await api("GET", "/ledger/account?isBankAccount=true&isInvoiceAccount=true&fields=*");
  const accounts = acctRes.data.values || [];
  for (const a of accounts) {
    console.log(`Account ${a.number} (id=${a.id}): bankAccountNumber="${a.bankAccountNumber}", isInvoiceAccount=${a.isInvoiceAccount}`);
  }

  // Step 2: Find an existing project to use for proof
  console.log("\n=== FINDING EXISTING PROJECTS ===");
  const projRes = await api("GET", "/project?count=5&fields=id,name,fixedprice,isFixedPrice,customer(id,organizationNumber),projectManager(id,email)");
  const projects = projRes.data.values || [];
  for (const p of projects) {
    console.log(`Project ${p.id}: name="${p.name}", fixedprice=${p.fixedprice}, isFixedPrice=${p.isFixedPrice}, customer.orgNr=${p.customer?.organizationNumber}, manager.email=${p.projectManager?.email}`);
  }

  // Step 3: Create a fresh fixture project with fixedprice=0 to prove the proactive hedge path
  // First we need a customer and manager
  const custRes = await api("GET", "/customer?count=1&fields=id,name,organizationNumber");
  const customer = custRes.data.values?.[0];
  console.log(`\nUsing customer: ${customer?.name} (id=${customer?.id})`);

  const empRes = await api("GET", "/employee?count=1&fields=id,email,firstName,lastName");
  const emp = empRes.data.values?.[0];
  console.log(`Using employee: ${emp?.firstName} ${emp?.lastName} (id=${emp?.id})`);

  // Create a fresh project with fixedprice=0
  const fixtureProject = await api("POST", "/project", {
    name: `ProactiveHedge Proof ${Date.now().toString(36)}`,
    startDate: "2026-01-01",
    customer: { id: customer.id },
    projectManager: { id: emp.id },
    isFixedPrice: false,
    fixedprice: 0,
  });
  const projId = fixtureProject.data.value?.id;
  console.log(`\nCreated fixture project id=${projId}`);

  // Now simulate the PROACTIVE HEDGE path for update-needed branch:
  // 1. GET /project (already done above conceptually - the fixture simulates this)
  // 2. PUT /project (set fixedprice)
  // 3. GET /ledger/vatType
  // 4. POST /order
  // 5. GET /ledger/account (proactive check)
  // 6a. If bank account missing: PUT /ledger/account, then PUT /order/:invoice (7 calls)
  // 6b. If bank account configured: PUT /order/:invoice (6 calls)

  console.log("\n=== PROACTIVE HEDGE PATH ===");
  let callCount = 0;

  // Call 1: GET /project (simulated by the fixture setup read above)
  callCount++;
  console.log(`\n[Call ${callCount}] GET /project (simulated by fixture)`);

  // Call 2: PUT /project to set fixedprice
  callCount++;
  console.log(`\n[Call ${callCount}] PUT /project/${projId}`);
  const putProjRes = await api("PUT", `/project/${projId}`, {
    id: projId,
    name: fixtureProject.data.value.name,
    startDate: "2026-01-01",
    customer: { id: customer.id },
    projectManager: { id: emp.id },
    isFixedPrice: true,
    fixedprice: 429500,
    invoiceOnAccountVatHigh: false,
  });
  console.log(`PUT /project result: fixedprice=${putProjRes.data.value?.fixedprice}, isFixedPrice=${putProjRes.data.value?.isFixedPrice}`);

  // Call 3: GET /ledger/vatType
  callCount++;
  console.log(`\n[Call ${callCount}] GET /ledger/vatType`);
  const vatRes = await api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*");
  const vatValues = vatRes.data.values || [];
  const vatRow = vatValues.find((v: any) => v.percentage === 25) || vatValues.find((v: any) => v.percentage === 0) || vatValues[0];
  console.log(`Using VAT: id=${vatRow?.id}, percentage=${vatRow?.percentage}`);

  // Call 4: POST /order
  callCount++;
  console.log(`\n[Call ${callCount}] POST /order`);
  const partialAmount = 429500 * 0.33; // = 141735
  const orderRes = await api("POST", "/order", {
    customer: { id: customer.id },
    project: { id: projId },
    orderDate: "2026-03-21",
    deliveryDate: "2026-03-21",
    orderLines: [{
      description: "Delbetaling 33% av fastpris – ProactiveHedge Proof",
      count: 1,
      unitPriceExcludingVatCurrency: partialAmount,
      vatType: { id: vatRow.id },
    }],
  });
  const orderId = orderRes.data.value?.id;
  console.log(`Created order id=${orderId}`);

  // Call 5: GET /ledger/account (PROACTIVE CHECK)
  callCount++;
  console.log(`\n[Call ${callCount}] GET /ledger/account (proactive check)`);
  const acctCheckRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
  const bankAccounts = acctCheckRes.data.values || [];
  const invoiceAcct = bankAccounts.find((a: any) => a.number === 1920) || bankAccounts[0];
  const needsBankFix = !invoiceAcct?.bankAccountNumber;
  console.log(`Invoice account ${invoiceAcct?.number}: bankAccountNumber="${invoiceAcct?.bankAccountNumber}", needs fix: ${needsBankFix}`);

  if (needsBankFix) {
    // Call 6: PUT /ledger/account
    callCount++;
    console.log(`\n[Call ${callCount}] PUT /ledger/account (fixing bank account)`);
    await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
      id: invoiceAcct.id,
      version: invoiceAcct.version,
      number: invoiceAcct.number,
      name: invoiceAcct.name,
      bankAccountNumber: "12345678903",
    });
  }

  // Call 6/7: PUT /order/:invoice
  callCount++;
  console.log(`\n[Call ${callCount}] PUT /order/:invoice`);
  const invoiceRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false`);
  console.log(`Invoice result: id=${invoiceRes.data.value?.id}, amountExcludingVatCurrency=${invoiceRes.data.value?.amountExcludingVatCurrency}, amountCurrencyOutstanding=${invoiceRes.data.value?.amountCurrencyOutstanding}`);

  console.log(`\n=== PROACTIVE HEDGE PATH COMPLETED IN ${callCount} MEASURED CALLS ===`);
  console.log(`Bank account was ${needsBankFix ? "MISSING" : "CONFIGURED"}`);
  console.log(`Path would be: ${needsBankFix ? "7" : "6"} calls for update-needed branch`);
}

main().catch((e) => {
  console.error("FATAL:", e.message || e);
  process.exit(1);
});
