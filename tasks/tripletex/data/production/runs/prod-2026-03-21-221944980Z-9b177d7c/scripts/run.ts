const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "sGJkEIJdIgfQzzZi2g6IPv-4lB-qrTVP5gOPAeK5pSo";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Content-Type": "application/json", Authorization: AUTH };
const TODAY = new Date().toISOString().slice(0, 10);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const j = await r.json();
  console.log(`${method} ${path} -> ${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(j, null, 2)); }
  return { status: r.status, data: j };
}

async function apiForm(method: string, path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method, headers: { Authorization: AUTH } });
  const j = await r.json();
  console.log(`${method} ${path} -> ${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(j, null, 2)); }
  return { status: r.status, data: j };
}

async function main() {
  // Step 1: Decisive project-first read
  const projRes = await api("GET", "/project?name=Implementaci%C3%B3n%20ERP&count=50&fields=*,customer(*),projectManager(*)");
  const projects = projRes.data?.values || [];

  let projectId: number | undefined;
  let customerId: number | undefined;
  let managerId: number | undefined;
  let startDate: string = TODAY;
  let needPut = true;

  // Find exact project match with matching customer org number
  const match = projects.find((p: any) =>
    p.name === "Implementación ERP" &&
    p.customer?.organizationNumber === "866378843"
  );

  if (match) {
    projectId = match.id;
    customerId = match.customer.id;
    startDate = match.startDate || TODAY;

    // Check if PM already matches
    if (match.projectManager?.email === "maria.sanchez@example.org") {
      managerId = match.projectManager.id;
    }

    // Check if we can skip PUT
    if (managerId && match.fixedprice === 457650 && match.isFixedPrice === true) {
      needPut = false;
      console.log("Project already has correct fixed price and manager — skipping PUT /project");
    }
  }

  // Step 3: If no customer from project read, resolve customer
  if (!customerId) {
    const custRes = await api("GET", "/customer?organizationNumber=866378843&count=10&fields=*");
    const custs = custRes.data?.values || [];
    const exactCust = custs.find((c: any) => c.organizationNumber === "866378843");
    if (exactCust) {
      customerId = exactCust.id;
    } else {
      // Create customer
      const newCust = await api("POST", "/customer", {
        name: "Solmar SL",
        organizationNumber: "866378843",
        invoiceSendMethod: "MANUAL"
      });
      customerId = newCust.data?.value?.id;
    }
  }

  // Step 5: If no manager from project read, resolve manager
  if (!managerId) {
    const empRes = await api("GET", "/employee?email=maria.sanchez@example.org&assignableProjectManagers=true&count=10&fields=*");
    const emps = empRes.data?.values || [];
    const exactEmp = emps.find((e: any) => e.email === "maria.sanchez@example.org");
    if (exactEmp) {
      managerId = exactEmp.id;
    } else {
      console.error("ERROR: Could not find employee maria.sanchez@example.org");
      process.exit(1);
    }
  }

  // Step 6: Create or update project
  if (!projectId) {
    const newProj = await api("POST", "/project", {
      name: "Implementación ERP",
      startDate,
      customer: { id: customerId },
      projectManager: { id: managerId },
      isFixedPrice: true,
      fixedprice: 457650,
      invoiceOnAccountVatHigh: false
    });
    projectId = newProj.data?.value?.id;
    customerId = newProj.data?.value?.customer?.id || customerId;
  } else if (needPut) {
    const updProj = await api("PUT", `/project/${projectId}`, {
      id: projectId,
      name: "Implementación ERP",
      startDate,
      customer: { id: customerId },
      projectManager: { id: managerId },
      isFixedPrice: true,
      fixedprice: 457650,
      invoiceOnAccountVatHigh: false
    });
    customerId = updProj.data?.value?.customer?.id || customerId;
  }

  // Step 7: Get VAT type
  const vatRes = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
  const vatTypes = vatRes.data?.values || [];
  // Prefer 25% for normal taxable service
  let vatType = vatTypes.find((v: any) => v.percentage === 25);
  if (!vatType) {
    // Fall back to 0% if that's all that's available
    vatType = vatTypes.find((v: any) => v.percentage === 0);
  }
  if (!vatType) {
    console.error("ERROR: No suitable VAT type found");
    process.exit(1);
  }
  console.log(`Using VAT type id=${vatType.id} (${vatType.percentage}%)`);

  // Step 8: Create order with milestone line
  const partialAmount = 457650 * 0.25; // = 114412.5
  const orderRes = await api("POST", "/order", {
    customer: { id: customerId },
    project: { id: projectId },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [{
      description: "Implementación ERP – 25% pago parcial",
      count: 1,
      unitPriceExcludingVatCurrency: partialAmount,
      vatType: { id: vatType.id }
    }]
  });
  const orderId = orderRes.data?.value?.id;

  // Step 9: Proactive bank account check (only on update-needed branch)
  if (needPut) {
    const bankRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
    const accounts = bankRes.data?.values || [];
    const invoiceAcct = accounts.find((a: any) => a.number === 1920);
    if (invoiceAcct && (!invoiceAcct.bankAccountNumber || invoiceAcct.bankAccountNumber.trim() === "")) {
      console.log("Invoice account 1920 missing bank number — fixing...");
      await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
        id: invoiceAcct.id,
        number: invoiceAcct.number,
        name: invoiceAcct.name,
        bankAccountNumber: "12345678903"
      });
    }
  }

  // Step 10: Invoice the order
  const invRes = await apiForm("PUT", `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
  console.log("\nInvoice created:");
  console.log(`  Invoice ID: ${invRes.data?.value?.id}`);
  console.log(`  Amount excl. VAT: ${invRes.data?.value?.amountExcludingVatCurrency}`);
  console.log(`  Outstanding: ${invRes.data?.value?.amountCurrencyOutstanding}`);
}

main().catch(e => { console.error(e); process.exit(1); });
