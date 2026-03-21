const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "rVE_9Azb4Pdr2Qo7KSMvVs-IAAV9ds5KUMuEDnYotqY";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const PROJECT_NAME = "Projet d'automatisation";
const CUSTOMER_ORG = "813648164";
const CUSTOMER_NAME = "Cascade SARL";
const PM_EMAIL = "hugo.bernard@example.org";
const FIXED_PRICE = 326550;
const MILESTONE_PCT = 0.75;
const MILESTONE_AMOUNT = FIXED_PRICE * MILESTONE_PCT; // 244912.5
const TODAY = "2026-03-21";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  console.log(`${method} ${url}`);
  const r = await fetch(url, opts);
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`  -> ${r.status}`, JSON.stringify(data).slice(0, 500));
  if (!r.ok) throw new Error(`${r.status} ${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  // Step 1: Decisive project read with expanded customer and PM
  const projRes = await api("GET", `/project?name=${encodeURIComponent(PROJECT_NAME)}&count=50&fields=*,customer(*),projectManager(*)`);

  const projects = (projRes.values || []).filter((p: any) => p.name === PROJECT_NAME);

  let projectId: number | undefined;
  let customerId: number | undefined;
  let pmId: number | undefined;
  let needPut = true;
  let startDate = TODAY;

  // Find the project matching by customer org number
  for (const p of projects) {
    if (p.customer?.organizationNumber === CUSTOMER_ORG) {
      projectId = p.id;
      customerId = p.customer.id;
      startDate = p.startDate || TODAY;

      // Check if PM already matches
      if (p.projectManager?.email?.toLowerCase() === PM_EMAIL.toLowerCase()) {
        pmId = p.projectManager.id;
      }

      // Check if PUT can be skipped
      if (pmId && p.fixedprice === FIXED_PRICE && p.isFixedPrice === true) {
        needPut = false;
      }
      break;
    }
  }

  // If project found but PM not matched from project read, resolve PM
  if (projectId && !pmId) {
    const empRes = await api("GET", `/employee?email=${encodeURIComponent(PM_EMAIL)}&assignableProjectManagers=true&count=10&fields=*`);
    const emp = (empRes.values || []).find((e: any) => e.email?.toLowerCase() === PM_EMAIL.toLowerCase());
    if (emp) pmId = emp.id;
    if (!pmId) throw new Error("Could not find assignable PM with email " + PM_EMAIL);
  }

  // If project not found, we need to resolve customer and PM, then create project
  if (!projectId) {
    // Resolve customer
    const custRes = await api("GET", `/customer?organizationNumber=${CUSTOMER_ORG}&count=10&fields=*`);
    const cust = (custRes.values || []).find((c: any) => c.organizationNumber === CUSTOMER_ORG);
    if (cust) {
      customerId = cust.id;
    } else {
      // Create customer
      const newCust = await api("POST", "/customer", {
        name: CUSTOMER_NAME,
        organizationNumber: CUSTOMER_ORG,
        invoiceSendMethod: "MANUAL",
      });
      customerId = newCust.value.id;
    }

    // Resolve PM
    const empRes = await api("GET", `/employee?email=${encodeURIComponent(PM_EMAIL)}&assignableProjectManagers=true&count=10&fields=*`);
    const emp = (empRes.values || []).find((e: any) => e.email?.toLowerCase() === PM_EMAIL.toLowerCase());
    if (emp) {
      pmId = emp.id;
    } else {
      throw new Error("Could not find assignable PM with email " + PM_EMAIL);
    }

    // Create project
    const newProj = await api("POST", "/project", {
      name: PROJECT_NAME,
      startDate: TODAY,
      customer: { id: customerId },
      projectManager: { id: pmId },
      isFixedPrice: true,
      fixedprice: FIXED_PRICE,
      invoiceOnAccountVatHigh: false,
    });
    projectId = newProj.value.id;
    needPut = false;
  }

  // Step 2: PUT project if needed
  if (needPut) {
    await api("PUT", `/project/${projectId}`, {
      id: projectId,
      name: PROJECT_NAME,
      startDate,
      customer: { id: customerId },
      projectManager: { id: pmId },
      isFixedPrice: true,
      fixedprice: FIXED_PRICE,
      invoiceOnAccountVatHigh: false,
    });
  }

  // Step 3: GET VAT type
  const vatRes = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
  const vatValues = vatRes.values || [];
  // Prefer 25% outgoing VAT, fall back to first available
  let vatType = vatValues.find((v: any) => v.percentage === 25);
  if (!vatType) vatType = vatValues[0];
  if (!vatType) throw new Error("No outgoing VAT type found");
  const vatTypeId = vatType.id;
  console.log(`Using VAT type id=${vatTypeId} percentage=${vatType.percentage}%`);

  // Step 4: POST order with milestone line
  const orderRes = await api("POST", "/order", {
    customer: { id: customerId },
    project: { id: projectId },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [{
      description: `Paiement d'étape - 75% du prix fixe`,
      count: 1,
      unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
      vatType: { id: vatTypeId },
    }],
  });
  const orderId = orderRes.value.id;

  // Step 5: On update-needed branch, proactive bank account check
  if (needPut) {
    const acctRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
    const accts = acctRes.values || [];
    const invoiceAcct = accts.find((a: any) => a.number === 1920) || accts[0];
    if (invoiceAcct && !invoiceAcct.bankAccountNumber) {
      console.log(`Fixing bank account ${invoiceAcct.id} (${invoiceAcct.number}) - missing bankAccountNumber`);
      await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
        id: invoiceAcct.id,
        number: invoiceAcct.number,
        name: invoiceAcct.name,
        bankAccountNumber: "12345678903",
      });
    }
  }

  // Step 6: Invoice the order
  const invRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
  console.log("\n=== DONE ===");
  console.log("Invoice ID:", invRes.value?.id);
  console.log("Amount excl VAT:", invRes.value?.amountExcludingVatCurrency);
  console.log("Amount outstanding:", invRes.value?.amountCurrencyOutstanding);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
