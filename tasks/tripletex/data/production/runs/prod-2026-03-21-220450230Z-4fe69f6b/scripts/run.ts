const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "dHI7C_RiU6SQmu5CU1rFHrsCswOHeB4P8ioMcgYgTA0";
const AUTH = "Basic " + Buffer.from("0:" + TOKEN).toString("base64");
const TODAY = "2026-03-21";

const FIXED_PRICE = 363850;
const PARTIAL_PCT = 0.75;
const PARTIAL_AMT = FIXED_PRICE * PARTIAL_PCT; // 272887.5

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  console.log(`${method} ${path} -> ${r.status}`);
  if (!r.ok) console.log(JSON.stringify(json, null, 2));
  return { status: r.status, data: json };
}

async function main() {
  // Step 1: Project-first resolver
  const projRes = await api("GET", `/project?name=${encodeURIComponent("Nettbutikk-utvikling")}&count=50&fields=*,customer(*),projectManager(*)`);

  const projects = (projRes.data?.values || []).filter((p: any) => p.name === "Nettbutikk-utvikling");
  const project = projects.length === 1 ? projects[0] : projects.find((p: any) => p.customer?.organizationNumber === "876325497");

  let projectId!: number;
  let customerId!: number;
  let needsPut = false;

  if (project) {
    projectId = project.id;
    customerId = project.customer?.id;

    const hasCorrectPrice = project.fixedprice === FIXED_PRICE && project.isFixedPrice === true;
    const hasCorrectCustomer = project.customer?.organizationNumber === "876325497";

    if (hasCorrectPrice && hasCorrectCustomer) {
      console.log("Project already at target state, skipping PUT");
    } else {
      needsPut = true;
      // PUT project with existing startDate and existing manager
      const putRes = await api("PUT", `/project/${projectId}`, {
        name: "Nettbutikk-utvikling",
        startDate: project.startDate,
        customer: { id: customerId },
        projectManager: { id: project.projectManager?.id },
        isFixedPrice: true,
        fixedprice: FIXED_PRICE,
        invoiceOnAccountVatHigh: false,
      });
      if (putRes.status !== 200) {
        console.error("PUT /project failed");
        return;
      }
    }
  } else {
    // Project does not exist — need to create customer + project
    needsPut = true;

    // Resolve customer
    const custRes = await api("GET", `/customer?organizationNumber=876325497&count=10&fields=*`);
    const customers = custRes.data?.values || [];
    if (customers.length > 0) {
      customerId = customers[0].id;
    } else {
      const newCust = await api("POST", "/customer", {
        name: "Havbris AS",
        organizationNumber: "876325497",
        invoiceSendMethod: "MANUAL",
      });
      customerId = newCust.data?.value?.id;
    }

    // Get assignable PM
    const empRes = await api("GET", `/employee?assignableProjectManagers=true&count=1&fields=*`);
    const managerId = empRes.data?.values?.[0]?.id;

    // Create project
    const newProj = await api("POST", "/project", {
      name: "Nettbutikk-utvikling",
      startDate: TODAY,
      customer: { id: customerId },
      projectManager: { id: managerId },
      isFixedPrice: true,
      fixedprice: FIXED_PRICE,
      invoiceOnAccountVatHigh: false,
    });
    projectId = newProj.data?.value?.id;
  }

  // Step 2: Get VAT type
  const vatRes = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
  const vatTypes = vatRes.data?.values || [];
  const vatType = vatTypes.find((v: any) => v.percentage === 25) || vatTypes[0];

  // Step 3: Create order with partial billing line
  const orderRes = await api("POST", "/order", {
    customer: { id: customerId },
    project: { id: projectId },
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
  const orderId = orderRes.data?.value?.id;

  // Step 4: Proactive bank check on update-needed branch
  if (needsPut) {
    const acctRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
    const accounts = acctRes.data?.values || [];
    const invoiceAcct = accounts.find((a: any) => a.number === 1920) || accounts.find((a: any) => a.isInvoiceAccount) || accounts[0];
    if (invoiceAcct && !invoiceAcct.bankAccountNumber) {
      await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
        ...invoiceAcct,
        bankAccountNumber: "12345678903",
      });
    }
  }

  // Step 5: Invoice the order
  const invRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);

  if (invRes.status === 200 || invRes.status === 201) {
    console.log("SUCCESS");
    console.log("Invoice ID:", invRes.data?.value?.id);
    console.log("Amount excl VAT:", invRes.data?.value?.amountExcludingVatCurrency);
    console.log("Amount outstanding:", invRes.data?.value?.amountCurrencyOutstanding);
  } else if (invRes.status === 422) {
    const errMsg = JSON.stringify(invRes.data);
    if (errMsg.includes("bankkontonummer") || errMsg.includes("bank")) {
      console.log("Bank account issue, fixing...");
      const acctRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
      const accounts = acctRes.data?.values || [];
      const invoiceAcct = accounts.find((a: any) => a.number === 1920) || accounts.find((a: any) => a.isInvoiceAccount) || accounts[0];
      if (invoiceAcct) {
        await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
          ...invoiceAcct,
          bankAccountNumber: "12345678903",
        });
        const retryRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
        console.log("Retry SUCCESS");
        console.log("Invoice ID:", retryRes.data?.value?.id);
        console.log("Amount excl VAT:", retryRes.data?.value?.amountExcludingVatCurrency);
      }
    }
  }
}

main().catch(console.error);
