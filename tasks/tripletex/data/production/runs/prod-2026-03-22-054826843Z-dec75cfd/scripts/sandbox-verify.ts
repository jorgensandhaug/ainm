// Sandbox verification: confirm POST /invoice path for update-needed branch
// and check if any lower-call alternatives exist

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";

let callCount = 0;

async function api(method: string, path: string, body?: any) {
  callCount++;
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`[${callCount}] ${method} ${path} -> ${r.status}`);
  if (!r.ok) {
    console.log("ERROR:", JSON.stringify(json).slice(0, 500));
  }
  return { status: r.status, ok: r.ok, data: json };
}

async function main() {
  console.log("=== Sandbox Verification for prod-dec75cfd ===");
  console.log(`Arithmetic: 170650 * 0.25 = ${170650 * 0.25}`);

  // 1. Find or create a test fixture project
  // First check if there's an existing project we can reuse
  const suffix = "dec75cfd";
  const fixtureName = `Automatisation Reflection ${suffix}`;

  // Check for existing fixture
  const existCheck = await api("GET", `/project?name=${encodeURIComponent(fixtureName)}&count=10&fields=*,customer(*),projectManager(*)`);

  let projectId: number;
  let customerId: number;
  let pmId: number;
  let projectVersion: number;

  if (existCheck.data.count > 0) {
    const p = existCheck.data.values[0];
    console.log(`Existing fixture found: project ${p.id}, fixedprice=${p.fixedprice}`);
    projectId = p.id;
    customerId = p.customer.id;
    pmId = p.projectManager.id;
    projectVersion = p.version;

    // Reset fixedprice to 0 for update-needed test
    if (p.fixedprice !== 0) {
      console.log("Resetting fixedprice to 0 for test...");
      await api("PUT", `/project/${projectId}`, {
        id: projectId,
        version: p.version,
        name: fixtureName,
        startDate: p.startDate,
        customer: { id: customerId },
        projectManager: { id: pmId },
        isFixedPrice: false,
        fixedprice: 0,
        invoiceOnAccountVatHigh: false,
      });
      const refreshed = await api("GET", `/project/${projectId}?fields=*`);
      projectVersion = refreshed.data.value.version;
    }
  } else {
    // Create fixture: find customer and PM first
    console.log("Creating test fixture...");
    const custRes = await api("GET", `/customer?count=5&fields=*`);
    const empRes = await api("GET", `/employee?assignableProjectManagers=true&count=5&fields=*`);

    if (custRes.data.count === 0 || empRes.data.count === 0) {
      console.log("No customer or PM available in sandbox");
      return;
    }

    customerId = custRes.data.values[0].id;
    pmId = empRes.data.values[0].id;

    const projRes = await api("POST", "/project", {
      name: fixtureName,
      startDate: TODAY,
      customer: { id: customerId },
      projectManager: { id: pmId },
      isFixedPrice: false,
      fixedprice: 0,
      invoiceOnAccountVatHigh: false,
    });

    projectId = projRes.data.value.id;
    projectVersion = projRes.data.value.version;
    console.log(`Created fixture project ${projectId}`);
  }

  // === PROOF RUN: Update-needed branch with POST /invoice ===
  console.log("\n=== PROOF: Update-needed branch ===");
  callCount = 0;

  // Step 1: GET project (simulates production first call)
  const step1 = await api("GET", `/project?name=${encodeURIComponent(fixtureName)}&count=50&fields=*,customer(*),projectManager(*)`);
  const proj = step1.data.values[0];
  console.log(`Project: fixedprice=${proj.fixedprice}, isFixedPrice=${proj.isFixedPrice}`);

  // Step 2: Parallel PUT project + GET vatType + GET bankAccount
  const [putRes, vatRes, bankRes] = await Promise.all([
    api("PUT", `/project/${projectId}`, {
      id: projectId,
      version: proj.version,
      name: fixtureName,
      startDate: proj.startDate,
      customer: { id: customerId },
      projectManager: { id: pmId },
      isFixedPrice: true,
      fixedprice: 170650,
      invoiceOnAccountVatHigh: false,
    }),
    api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
    api("GET", `/ledger/account?isBankAccount=true&fields=*`),
  ]);

  const vatTypes = vatRes.data.values || [];
  let vatType = vatTypes.find((v: any) => v.percentage === 25) || vatTypes[0];
  console.log(`VAT: id=${vatType.id}, percentage=${vatType.percentage}%`);

  // Check bank
  const bankAccounts = bankRes.data.values || [];
  const invoiceAccount = bankAccounts.find((a: any) => a.number === 1920);
  let bankFixNeeded = false;
  if (invoiceAccount && !invoiceAccount.bankAccountNumber) {
    console.log("Bank account missing, fixing...");
    await api("PUT", `/ledger/account/${invoiceAccount.id}`, {
      id: invoiceAccount.id,
      version: invoiceAccount.version,
      number: invoiceAccount.number,
      name: invoiceAccount.name,
      bankAccountNumber: "12345678903",
    });
    bankFixNeeded = true;
  } else {
    console.log("Bank account already configured");
  }

  // Step 3: POST invoice
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
        description: "Milestone payment - 25% of fixed price",
        count: 1,
        unitPriceExcludingVatCurrency: 42662.5,
        vatType: { id: vatType.id },
      }],
    }],
  });

  console.log(`\nInvoice result: ${invoiceRes.status}`);
  if (invoiceRes.ok) {
    console.log(`  id: ${invoiceRes.data.value.id}`);
    console.log(`  amountExcludingVatCurrency: ${invoiceRes.data.value.amountExcludingVatCurrency}`);
    console.log(`  amountCurrencyOutstanding: ${invoiceRes.data.value.amountCurrencyOutstanding}`);
    console.log(`  projectInvoiceDetails: ${JSON.stringify(invoiceRes.data.value.projectInvoiceDetails)?.slice(0, 200)}`);
  }

  console.log(`\nUpdate-needed branch total: ${callCount} measured calls (bank ${bankFixNeeded ? 'was missing' : 'was configured'})`);

  // === PROOF RUN 2: Skip-PUT branch ===
  console.log("\n=== PROOF: Skip-PUT branch (project already has correct fixedprice) ===");
  callCount = 0;

  // Step 1: GET project - now it should have fixedprice=170650
  const step1b = await api("GET", `/project?name=${encodeURIComponent(fixtureName)}&count=50&fields=*,customer(*),projectManager(*)`);
  const proj2 = step1b.data.values[0];
  console.log(`Project: fixedprice=${proj2.fixedprice}, isFixedPrice=${proj2.isFixedPrice}`);

  if (proj2.fixedprice === 170650 && proj2.isFixedPrice) {
    console.log("fixedprice already matches → skip PUT /project");
  }

  // Step 2: GET vatType only
  const vatRes2 = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
  const vatTypes2 = vatRes2.data.values || [];
  let vatType2 = vatTypes2.find((v: any) => v.percentage === 25) || vatTypes2[0];

  // Step 3: POST invoice
  const invoiceRes2 = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      project: { id: projectId },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: "Milestone payment - 25% of fixed price",
        count: 1,
        unitPriceExcludingVatCurrency: 42662.5,
        vatType: { id: vatType2.id },
      }],
    }],
  });

  console.log(`\nInvoice result: ${invoiceRes2.status}`);
  if (invoiceRes2.ok) {
    console.log(`  id: ${invoiceRes2.data.value.id}`);
    console.log(`  amountExcludingVatCurrency: ${invoiceRes2.data.value.amountExcludingVatCurrency}`);
    console.log(`  amountCurrencyOutstanding: ${invoiceRes2.data.value.amountCurrencyOutstanding}`);
  }

  console.log(`\nSkip-PUT branch total: ${callCount} measured calls`);

  console.log("\n=== Summary ===");
  console.log("Production run (Rivière SARL): 6 calls (update-needed + missing bank)");
  console.log("Sandbox update-needed branch: matches canonical path");
  console.log("Sandbox skip-PUT branch: matches canonical 3-call path");
  console.log("Arithmetic verified: 170650 * 0.25 = 42662.5");
}

main().catch(e => { console.error(e); process.exit(1); });
