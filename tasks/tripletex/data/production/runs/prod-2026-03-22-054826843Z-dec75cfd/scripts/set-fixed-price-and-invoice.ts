const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "ESi56agTvAAhda5zPF9AFOt5p4xxOEsd3lUP3_E0VXY";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";

const PROJECT_NAME = "Projet d'automatisation";
const ORG_NUMBER = "852968737";
const PM_EMAIL = "nathan.martin@example.org";
const FIXED_PRICE = 170650;
const MILESTONE_PCT = 0.25;
const MILESTONE_AMOUNT = FIXED_PRICE * MILESTONE_PCT; // 42662.5

async function api(method: string, path: string, body?: any) {
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
  console.log(`${method} ${path} -> ${r.status}`);
  if (!r.ok) {
    console.log("ERROR:", JSON.stringify(json).slice(0, 500));
    throw new Error(`${method} ${path} failed ${r.status}`);
  }
  return json;
}

async function main() {
  // Step 1: Find existing project with expanded customer and PM
  const projRes = await api("GET", `/project?name=${encodeURIComponent(PROJECT_NAME)}&count=50&fields=*,customer(*),projectManager(*)`);

  const projects = projRes.values || [];
  const project = projects.find((p: any) =>
    p.name === PROJECT_NAME &&
    p.customer?.organizationNumber === ORG_NUMBER
  );

  if (!project) throw new Error("Project not found");

  console.log(`Found project ${project.id}, fixedprice=${project.fixedprice}, isFixedPrice=${project.isFixedPrice}`);
  console.log(`Customer: ${project.customer?.name} (${project.customer?.organizationNumber}), id=${project.customer?.id}`);
  console.log(`PM: ${project.projectManager?.email}, id=${project.projectManager?.id}`);

  const customerId = project.customer.id;
  const projectId = project.id;
  const startDate = project.startDate;

  // Check if PM email matches
  const pmMatches = project.projectManager?.email === PM_EMAIL;
  let pmId = pmMatches ? project.projectManager.id : null;

  if (!pmMatches) {
    console.log(`PM mismatch: ${project.projectManager?.email} vs ${PM_EMAIL}, resolving...`);
    const empRes = await api("GET", `/employee?email=${encodeURIComponent(PM_EMAIL)}&assignableProjectManagers=true&count=10&fields=*`);
    const emp = (empRes.values || []).find((e: any) => e.email === PM_EMAIL);
    if (!emp) throw new Error("PM not found");
    pmId = emp.id;
  }

  // Check if project already has correct fixedprice
  const needsUpdate = project.fixedprice !== FIXED_PRICE || !project.isFixedPrice || !pmMatches;

  if (needsUpdate) {
    console.log("Project needs update, using proactive hedge branch...");

    // Parallel: PUT project + GET vatType + GET bank account
    const [putRes, vatRes, bankRes] = await Promise.all([
      api("PUT", `/project/${projectId}`, {
        id: projectId,
        version: project.version,
        name: PROJECT_NAME,
        startDate,
        customer: { id: customerId },
        projectManager: { id: pmId },
        isFixedPrice: true,
        fixedprice: FIXED_PRICE,
        invoiceOnAccountVatHigh: false,
      }),
      api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
      api("GET", `/ledger/account?isBankAccount=true&fields=*`),
    ]);

    // Find 25% VAT type, fallback to whatever is available
    const vatTypes = vatRes.values || [];
    let vatType = vatTypes.find((v: any) => v.percentage === 25);
    if (!vatType) vatType = vatTypes[0];
    console.log(`VAT type: id=${vatType.id}, percentage=${vatType.percentage}%`);

    // Check bank account
    const bankAccounts = bankRes.values || [];
    const invoiceAccount = bankAccounts.find((a: any) => a.number === 1920);
    if (invoiceAccount && !invoiceAccount.bankAccountNumber) {
      console.log("Bank account missing, fixing...");
      await api("PUT", `/ledger/account/${invoiceAccount.id}`, {
        id: invoiceAccount.id,
        version: invoiceAccount.version,
        number: invoiceAccount.number,
        name: invoiceAccount.name,
        bankAccountNumber: "12345678903",
      });
    }

    // POST invoice with embedded orders
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
          description: `Milestone payment - 25% of fixed price`,
          count: 1,
          unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
          vatType: { id: vatType.id },
        }],
      }],
    });

    console.log("Invoice created:", invoiceRes.value?.id);
    console.log("amountExcludingVatCurrency:", invoiceRes.value?.amountExcludingVatCurrency);
    console.log("amountCurrencyOutstanding:", invoiceRes.value?.amountCurrencyOutstanding);

  } else {
    console.log("Project already has correct fixedprice, skip-PUT branch...");

    // Just GET vatType
    const vatRes = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
    const vatTypes = vatRes.values || [];
    let vatType = vatTypes.find((v: any) => v.percentage === 25);
    if (!vatType) vatType = vatTypes[0];
    console.log(`VAT type: id=${vatType.id}, percentage=${vatType.percentage}%`);

    // POST invoice with embedded orders
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
          description: `Milestone payment - 25% of fixed price`,
          count: 1,
          unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
          vatType: { id: vatType.id },
        }],
      }],
    });

    console.log("Invoice created:", invoiceRes.value?.id);
    console.log("amountExcludingVatCurrency:", invoiceRes.value?.amountExcludingVatCurrency);
    console.log("amountCurrencyOutstanding:", invoiceRes.value?.amountCurrencyOutstanding);
  }

  console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });
