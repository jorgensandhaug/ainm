// Sandbox verification: confirm the update-needed proactive-hedge path
// with arithmetic 363850 * 0.75 = 272887.5
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + Buffer.from("0:" + TOKEN).toString("base64");
const TODAY = "2026-03-21";
const FIXED_PRICE = 363850;
const PARTIAL_PCT = 0.75;
const PARTIAL_AMT = FIXED_PRICE * PARTIAL_PCT; // 272887.5
const UID = Math.random().toString(16).slice(2, 10);

let callCount = 0;

async function api(method: string, path: string, body?: any) {
  callCount++;
  const url = `${BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  console.log(`[${callCount}] ${method} ${path} -> ${r.status}`);
  if (!r.ok) console.log(JSON.stringify(json, null, 2));
  return { status: r.status, data: json };
}

async function main() {
  // FIXTURE SETUP (not counted in measured path)
  console.log("=== FIXTURE SETUP ===");
  callCount = 0;

  // Create a customer for the fixture
  const custRes = await api("POST", "/customer", {
    name: `Havbris Reflection ${UID} AS`,
    organizationNumber: "876325497",
    invoiceSendMethod: "MANUAL",
  });
  const customerId = custRes.data?.value?.id;
  console.log("Customer ID:", customerId);

  // Get assignable PM
  const empRes = await api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*");
  const managerId = empRes.data?.values?.[0]?.id;
  const managerEmail = empRes.data?.values?.[0]?.email;
  console.log("Manager ID:", managerId, "Email:", managerEmail);

  // Create project with fixedprice=0 (simulates fresh production state)
  const projRes = await api("POST", "/project", {
    name: `Nettbutikk-utvikling Reflection ${UID}`,
    startDate: TODAY,
    customer: { id: customerId },
    projectManager: { id: managerId },
    isFixedPrice: false,
    fixedprice: 0,
    invoiceOnAccountVatHigh: false,
  });
  const projectId = projRes.data?.value?.id;
  const projectName = projRes.data?.value?.name;
  console.log("Project ID:", projectId, "Name:", projectName);

  console.log("\n=== MEASURED PATH: Update-needed proactive-hedge ===");
  callCount = 0;

  // Step 1: GET /project
  const p1 = await api("GET", `/project?name=${encodeURIComponent(projectName)}&count=50&fields=*,customer(*),projectManager(*)`);
  const projects = (p1.data?.values || []).filter((p: any) => p.name === projectName);
  const project = projects[0];
  console.log("Found project:", project?.name, "fixedprice:", project?.fixedprice, "isFixedPrice:", project?.isFixedPrice);
  console.log("Customer orgNr:", project?.customer?.organizationNumber);
  console.log("PM email:", project?.projectManager?.email);

  // Step 2: PUT /project (fixedprice needs update)
  const p2 = await api("PUT", `/project/${project.id}`, {
    name: project.name,
    startDate: project.startDate,
    customer: { id: project.customer.id },
    projectManager: { id: project.projectManager.id },
    isFixedPrice: true,
    fixedprice: FIXED_PRICE,
    invoiceOnAccountVatHigh: false,
  });
  console.log("Updated fixedprice:", p2.data?.value?.fixedprice, "isFixedPrice:", p2.data?.value?.isFixedPrice);

  // Step 3: GET /ledger/vatType
  const p3 = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
  const vatTypes = p3.data?.values || [];
  const vatType = vatTypes.find((v: any) => v.percentage === 25) || vatTypes[0];
  console.log("VAT type:", vatType?.id, "percentage:", vatType?.percentage);

  // Step 4: POST /order
  const p4 = await api("POST", "/order", {
    customer: { id: project.customer.id },
    project: { id: project.id },
    orderDate: TODAY,
    deliveryDate: TODAY,
    invoiceOnAccountVatHigh: false,
    orderLines: [
      {
        description: "Delbetaling 75% av fastpris",
        count: 1,
        unitPriceExcludingVatCurrency: PARTIAL_AMT,
        vatType: { id: vatType.id },
      },
    ],
  });
  const orderId = p4.data?.value?.id;
  console.log("Order ID:", orderId);

  // Step 5: GET /ledger/account (proactive hedge)
  const p5 = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
  const accounts = p5.data?.values || [];
  const invoiceAcct = accounts.find((a: any) => a.number === 1920) || accounts.find((a: any) => a.isInvoiceAccount) || accounts[0];
  console.log("Invoice account:", invoiceAcct?.number, "bankAccountNumber:", invoiceAcct?.bankAccountNumber);

  if (invoiceAcct && !invoiceAcct.bankAccountNumber) {
    // Step 5b: PUT /ledger/account (fix bank account)
    await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
      ...invoiceAcct,
      bankAccountNumber: "12345678903",
    });
    console.log("Fixed bank account");
  }

  // Step 6: PUT /order/:invoice
  const p6 = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
  console.log("Invoice ID:", p6.data?.value?.id);
  console.log("Amount excl VAT:", p6.data?.value?.amountExcludingVatCurrency);
  console.log("Amount outstanding:", p6.data?.value?.amountCurrencyOutstanding);

  console.log(`\n=== TOTAL MEASURED CALLS: ${callCount} ===`);
  console.log("Expected: 6 (bank configured) or 7 (bank missing)");
}

main().catch(console.error);
