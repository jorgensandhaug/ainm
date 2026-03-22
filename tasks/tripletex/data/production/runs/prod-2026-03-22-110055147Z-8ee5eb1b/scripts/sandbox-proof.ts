// Sandbox verification: prove update-needed + POST /invoice path
// for 415050 * 0.50 = 207525
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";

const FIXED_PRICE = 415050;
const MILESTONE_AMT = FIXED_PRICE * 0.50; // 207525

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log("ERROR:", JSON.stringify(json, null, 2)); return null; }
  return json;
}

async function run() {
  // Step 1: Create fixture project for sandbox proof
  const fixtureName = `Sonnental Reflection ${Date.now().toString(36)}`;

  // Get whoAmI for company info
  const whoAmI = await api("GET", "/token/session/>whoAmI?fields=*,company(id,name)");
  if (!whoAmI) return;
  console.log("Company:", whoAmI.value.company.id, whoAmI.value.company.name);

  // Find an assignable PM
  const empRes = await api("GET", "/employee?assignableProjectManagers=true&count=5&fields=*");
  if (!empRes) return;
  const pm = empRes.values[0];
  console.log("PM:", pm.id, pm.email);

  // Find or create a customer
  const custRes = await api("GET", "/customer?count=5&fields=*");
  if (!custRes) return;
  let customerId: number;
  if (custRes.values.length > 0) {
    customerId = custRes.values[0].id;
    console.log("Existing customer:", customerId, custRes.values[0].name);
  } else {
    const newCust = await api("POST", "/customer", { name: "Sonnental Sandbox GmbH", organizationNumber: "999777123", invoiceSendMethod: "MANUAL" });
    if (!newCust) return;
    customerId = newCust.value.id;
    console.log("Created customer:", customerId);
  }

  // Create project with fixedprice=0 (simulating production state)
  const projRes = await api("POST", "/project", {
    name: fixtureName,
    startDate: TODAY,
    customer: { id: customerId },
    projectManager: { id: pm.id },
    isFixedPrice: false,
    fixedprice: 0,
    invoiceOnAccountVatHigh: false,
  });
  if (!projRes) return;
  const projectId = projRes.value.id;
  console.log("Created fixture project:", projectId, fixtureName, "fixedprice:", projRes.value.fixedprice);

  // === NOW PROVE THE PRODUCTION PATH ===
  console.log("\n=== PROVING UPDATE-NEEDED PATH ===");
  let callCount = 0;

  // Step 1: GET project (free)
  const projSearch = await api("GET", `/project?name=${encodeURIComponent(fixtureName)}&count=50&fields=*,customer(*),projectManager(*)`);
  callCount++;
  if (!projSearch) return;
  const proj = projSearch.values.find((p: any) => p.name === fixtureName);
  console.log("Found project:", proj.id, "fixedprice:", proj.fixedprice, "PM:", proj.projectManager?.email, "customer:", proj.customer?.id);

  // Step 2: Parallel PUT project + GET vatType + GET bank account (1 write + 2 free GETs)
  const [putProj, vatRes, bankRes] = await Promise.all([
    api("PUT", `/project/${projectId}`, {
      id: projectId,
      name: fixtureName,
      startDate: proj.startDate,
      customer: { id: customerId },
      projectManager: { id: pm.id },
      isFixedPrice: true,
      fixedprice: FIXED_PRICE,
      invoiceOnAccountVatHigh: false,
    }),
    api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
    api("GET", `/ledger/account?isBankAccount=true&fields=*`),
  ]);
  callCount += 3;

  if (!putProj) return;
  console.log("Project updated: fixedprice =", putProj.value.fixedprice);

  if (!vatRes) return;
  const vatTypes = vatRes.values || [];
  const vatType = vatTypes.find((v: any) => v.percentage === 25) || vatTypes[0];
  console.log("VAT:", vatType?.id, vatType?.percentage + "%");

  if (!bankRes) return;
  const bankAccts = bankRes.values || [];
  const invoiceAcct = bankAccts.find((a: any) => a.number === 1920) || bankAccts[0];
  console.log("Bank acct:", invoiceAcct?.id, "number:", invoiceAcct?.number, "bankAccountNumber:", invoiceAcct?.bankAccountNumber);

  // Conditional: fix bank if missing (0-1 write)
  if (invoiceAcct && !invoiceAcct.bankAccountNumber) {
    console.log("Bank missing — fixing...");
    await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
      id: invoiceAcct.id,
      number: invoiceAcct.number,
      name: invoiceAcct.name,
      bankAccountNumber: "12345678903",
    });
    callCount++;
    console.log("Bank fixed");
  } else {
    console.log("Bank already configured — no fix needed");
  }

  // Step 3: POST invoice (1 write)
  const invoiceRes = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      project: { id: projectId },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: `Meilensteinzahlung 50% - ${fixtureName}`,
        count: 1,
        unitPriceExcludingVatCurrency: MILESTONE_AMT,
        vatType: { id: vatType.id },
      }],
    }],
  });
  callCount++;

  if (!invoiceRes) return;
  const inv = invoiceRes.value;
  console.log("Invoice:", inv.id, "amountExcludingVatCurrency:", inv.amountExcludingVatCurrency, "outstanding:", inv.amountCurrencyOutstanding);

  // Verification GETs (free)
  const verifyInv = await api("GET", `/invoice/${inv.id}?fields=*,orders(*,project(*),orderLines(*)),orderLines(*),customer(id,name,organizationNumber)`);
  callCount++;
  if (verifyInv) {
    const vi = verifyInv.value;
    console.log("VERIFY invoice:", vi.invoiceNumber, "amount:", vi.amountExcludingVatCurrency, "outstanding:", vi.amountCurrencyOutstanding);
    console.log("VERIFY customer:", vi.customer?.name, vi.customer?.organizationNumber);
    console.log("VERIFY project linkage:", vi.orders?.[0]?.project?.id, vi.orders?.[0]?.project?.fixedprice);
  }

  const verifyProj = await api("GET", `/project/${projectId}?fields=*,customer(id,name)`);
  callCount++;
  if (verifyProj) {
    console.log("VERIFY project:", verifyProj.value.name, "fixedprice:", verifyProj.value.fixedprice, "isFixedPrice:", verifyProj.value.isFixedPrice);
  }

  console.log(`\n=== PROOF COMPLETE: ${callCount} measured calls ===`);
  console.log(`Expected milestone amount: ${MILESTONE_AMT}`);
  console.log(`Actual amountExcludingVatCurrency: ${inv.amountExcludingVatCurrency}`);
  console.log(`Match: ${inv.amountExcludingVatCurrency === MILESTONE_AMT}`);
}

run().catch(console.error);
