const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "GCrDYHzJ5r8SudOfsq2I9dacRxelrSvc0tvtvQUlcq8";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

const PROJECT_NAME = "Migração para nuvem";
const CUSTOMER_ORG = "922471126";
const CUSTOMER_NAME = "Estrela Lda";
const MANAGER_EMAIL = "leonor.sousa@example.org";
const FIXED_PRICE = 313650;
const MILESTONE_FRACTION = 0.50;
const MILESTONE_AMOUNT = FIXED_PRICE * MILESTONE_FRACTION; // 156825

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  console.log(`\n>>> ${method} ${path}`);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`<<< ${res.status}`);
  if (typeof data === "object") console.log(JSON.stringify(data, null, 2));
  else console.log(data);
  if (!res.ok) throw new Error(`${res.status} on ${method} ${path}`);
  return data;
}

async function main() {
  // Step 1: project-first resolver
  const projRes = await api("GET", `/project?name=${encodeURIComponent(PROJECT_NAME)}&count=50&fields=*,customer(*),projectManager(*)`);

  const projects = projRes.values || [];
  const proj = projects.find((p: any) => p.name === PROJECT_NAME && p.customer?.organizationNumber === CUSTOMER_ORG);

  if (!proj) {
    throw new Error("Project not found with matching customer org number - need different resolution path");
  }

  const projectId = proj.id;
  const customerId = proj.customer.id;
  const existingStartDate = proj.startDate;

  // Check if manager already matches
  let managerId: number;
  const managerMatches = proj.projectManager?.email === MANAGER_EMAIL;
  if (managerMatches) {
    managerId = proj.projectManager.id;
    console.log(`Manager already matches: id=${managerId}`);
  } else {
    // Need to resolve manager
    const empRes = await api("GET", `/employee?email=${encodeURIComponent(MANAGER_EMAIL)}&assignableProjectManagers=true&count=10&fields=*`);
    const emp = (empRes.values || []).find((e: any) => e.email === MANAGER_EMAIL);
    if (!emp) throw new Error("Manager not found");
    managerId = emp.id;
  }

  // Check if project already has correct fixed price and manager
  const projectAlreadyCorrect = proj.fixedprice === FIXED_PRICE && managerMatches;
  let updateNeeded = false;

  if (projectAlreadyCorrect) {
    console.log(`Project already has fixedprice=${FIXED_PRICE} and correct manager. Skipping PUT /project.`);
  } else {
    // PUT /project to update
    updateNeeded = true;
    await api("PUT", `/project/${projectId}`, {
      name: PROJECT_NAME,
      startDate: existingStartDate,
      customer: { id: customerId },
      projectManager: { id: managerId },
      isFixedPrice: true,
      fixedprice: FIXED_PRICE,
      invoiceOnAccountVatHigh: false,
    });
  }

  // Step 7: VAT lookup
  const vatRes = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
  const vatTypes = vatRes.values || [];
  // Prefer 25% if available, else use whatever is available
  let vatType = vatTypes.find((v: any) => v.percentage === 25);
  if (!vatType) vatType = vatTypes[0];
  if (!vatType) throw new Error("No outgoing VAT type found");
  console.log(`Using VAT type id=${vatType.id} percentage=${vatType.percentage}%`);

  // Step 8: POST /order
  const orderRes = await api("POST", "/order", {
    customer: { id: customerId },
    project: { id: projectId },
    orderDate: TODAY,
    deliveryDate: TODAY,
    invoiceOnAccountVatHigh: false,
    orderLines: [
      {
        description: `Milestone payment 50% of fixed price`,
        count: 1,
        unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
        vatType: { id: vatType.id },
      },
    ],
  });
  const orderId = orderRes.value.id;

  // Step 9: On update-needed branch, proactive bank account check
  if (updateNeeded) {
    const bankRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
    const accounts = bankRes.values || [];
    const invoiceAcct = accounts.find((a: any) => a.number === 1920 || a.isInvoiceAccount);
    if (invoiceAcct && (!invoiceAcct.bankAccountNumber || invoiceAcct.bankAccountNumber.trim() === "")) {
      console.log(`Invoice account ${invoiceAcct.number} missing bankAccountNumber, fixing...`);
      await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
        ...invoiceAcct,
        bankAccountNumber: "10002000030",
      });
    } else {
      console.log(`Invoice account bank number OK: ${invoiceAcct?.bankAccountNumber}`);
    }
  }

  // Step 10: Invoice the order
  const invRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);

  console.log("\n=== RESULT ===");
  console.log(`Invoice id: ${invRes.value.id}`);
  console.log(`Customer id: ${invRes.value.customer?.id}`);
  console.log(`amountExcludingVatCurrency: ${invRes.value.amountExcludingVatCurrency}`);
  console.log(`amountCurrencyOutstanding: ${invRes.value.amountCurrencyOutstanding}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
