// Setup fixture in persistent sandbox for this task shape:
// Project "Migração para nuvem", customer Estrela Lda (922471126), manager by email, fixedprice=0 initially
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

let callCount = 0;

async function api(method: string, path: string, body?: any) {
  callCount++;
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`[${callCount}] ${method} ${path} -> ${r.status}`);
  if (!r.ok) {
    console.error(JSON.stringify(json, null, 2));
    throw new Error(`${r.status} on ${method} ${path}`);
  }
  return json;
}

const SUFFIX = `Reflection ${Date.now().toString(36)}`;
const TODAY = "2026-03-21";

async function main() {
  // Find or create a customer with organizationNumber 922471126
  const custSearch = await api("GET", `/customer?organizationNumber=922471126&count=10&fields=*`);
  let customerId: number;
  if (custSearch.values && custSearch.values.length > 0) {
    customerId = custSearch.values[0].id;
    console.log(`Customer exists: id=${customerId}`);
  } else {
    const custCreate = await api("POST", "/customer", {
      name: "Estrela Lda",
      organizationNumber: "922471126",
      invoiceSendMethod: "MANUAL",
    });
    customerId = custCreate.value.id;
    console.log(`Customer created: id=${customerId}`);
  }

  // Find an assignable project manager
  const empSearch = await api("GET", `/employee?assignableProjectManagers=true&count=10&fields=*`);
  const manager = empSearch.values[0];
  const managerId = manager.id;
  const managerEmail = manager.email;
  console.log(`Manager: id=${managerId}, email=${managerEmail}`);

  // Create project with fixedprice=0 (to simulate update-needed branch)
  const projName = `Migração para nuvem ${SUFFIX}`;
  const projCreate = await api("POST", "/project", {
    name: projName,
    startDate: TODAY,
    customer: { id: customerId },
    projectManager: { id: managerId },
    isFixedPrice: false,
    fixedprice: 0,
    invoiceOnAccountVatHigh: false,
  });
  const projectId = projCreate.value.id;
  console.log(`Project created: id=${projectId}, name="${projName}"`);
  console.log(`Fixture ready. callCount so far: ${callCount}`);
  console.log(`\n--- MEASURING UPDATE-NEEDED PROACTIVE HEDGE PATH ---`);

  // Reset call counter for the measured path
  callCount = 0;

  // Step 1: GET project with expanded customer and manager
  const projRes = await api("GET", `/project?name=${encodeURIComponent(projName)}&count=50&fields=*,customer(*),projectManager(*)`);
  const proj = projRes.values.find((p: any) => p.name === projName && p.customer?.organizationNumber === "922471126");
  if (!proj) throw new Error("Project not found");
  console.log(`  fixedprice=${proj.fixedprice}, isFixedPrice=${proj.isFixedPrice}`);
  console.log(`  customer.orgNr=${proj.customer.organizationNumber}, manager.email=${proj.projectManager?.email}`);

  // Step 2: PUT project (update-needed because fixedprice=0)
  const putRes = await api("PUT", `/project/${proj.id}`, {
    id: proj.id,
    name: projName,
    startDate: proj.startDate,
    customer: { id: proj.customer.id },
    projectManager: { id: proj.projectManager.id },
    isFixedPrice: true,
    fixedprice: 313650,
    invoiceOnAccountVatHigh: false,
  });
  console.log(`  Updated: fixedprice=${putRes.value.fixedprice}`);

  // Step 3: GET VAT type
  const vatRes = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
  const vatTypes = vatRes.values || [];
  let vatType = vatTypes.find((v: any) => v.percentage === 25) || vatTypes.find((v: any) => v.percentage === 0);
  if (!vatType) throw new Error("No VAT type");
  console.log(`  VAT: id=${vatType.id}, ${vatType.percentage}%`);

  // Step 4: POST order
  const orderRes = await api("POST", "/order", {
    customer: { id: proj.customer.id },
    project: { id: proj.id },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [{
      description: "Milestone payment 50% of fixed price",
      count: 1,
      unitPriceExcludingVatCurrency: 156825,
      vatType: { id: vatType.id },
    }],
  });
  const orderId = orderRes.value.id;
  console.log(`  Order: id=${orderId}`);

  // Step 5: Proactive hedge - GET /ledger/account
  const bankRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
  const accounts = bankRes.values || [];
  const invoiceAcct = accounts.find((a: any) => a.number === 1920);
  if (invoiceAcct && (!invoiceAcct.bankAccountNumber || invoiceAcct.bankAccountNumber.trim() === "")) {
    console.log("  Bank account 1920 missing, fixing...");
    await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
      id: invoiceAcct.id,
      number: invoiceAcct.number,
      name: invoiceAcct.name,
      bankAccountNumber: "12345678903",
    });
  } else {
    console.log(`  Bank account 1920 configured: ${invoiceAcct?.bankAccountNumber}`);
  }

  // Step 6: Invoice
  const invRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
  console.log(`  Invoice: id=${invRes.value.id}`);
  console.log(`  amountExcludingVatCurrency=${invRes.value.amountExcludingVatCurrency}`);
  console.log(`  amountCurrencyOutstanding=${invRes.value.amountCurrencyOutstanding}`);

  console.log(`\nMeasured calls: ${callCount}`);

  // Now test skip-PUT branch: project already has fixedprice=313650
  console.log(`\n--- MEASURING SKIP-PUT BRANCH ---`);
  callCount = 0;

  // Step 1: GET project (should now show fixedprice=313650)
  const projRes2 = await api("GET", `/project?name=${encodeURIComponent(projName)}&count=50&fields=*,customer(*),projectManager(*)`);
  const proj2 = projRes2.values.find((p: any) => p.name === projName && p.customer?.organizationNumber === "922471126");
  if (!proj2) throw new Error("Project not found");
  console.log(`  fixedprice=${proj2.fixedprice}, isFixedPrice=${proj2.isFixedPrice}`);

  // Skip PUT since fixedprice already matches

  // Step 2: GET VAT type
  const vatRes2 = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
  const vatTypes2 = vatRes2.values || [];
  let vatType2 = vatTypes2.find((v: any) => v.percentage === 25) || vatTypes2.find((v: any) => v.percentage === 0);
  console.log(`  VAT: id=${vatType2.id}, ${vatType2.percentage}%`);

  // Step 3: POST order
  const orderRes2 = await api("POST", "/order", {
    customer: { id: proj2.customer.id },
    project: { id: proj2.id },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [{
      description: "Milestone payment 50% of fixed price",
      count: 1,
      unitPriceExcludingVatCurrency: 156825,
      vatType: { id: vatType2.id },
    }],
  });
  const orderId2 = orderRes2.value.id;
  console.log(`  Order: id=${orderId2}`);

  // No proactive hedge on skip-PUT branch

  // Step 4: Invoice
  const invRes2 = await api("PUT", `/order/${orderId2}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
  console.log(`  Invoice: id=${invRes2.value.id}`);
  console.log(`  amountExcludingVatCurrency=${invRes2.value.amountExcludingVatCurrency}`);
  console.log(`  amountCurrencyOutstanding=${invRes2.value.amountCurrencyOutstanding}`);

  console.log(`\nMeasured calls: ${callCount}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
