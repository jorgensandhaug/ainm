const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "kvmZzakHReoZg5Ut7E95e5UEr2KBD_KG1gJL3M21MbQ";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const PROJ_NAME = "ERP-Implementierung";
const CUST_ORG = "896608479";
const PM_EMAIL = "mia.meyer@example.org";
const FIXED_PRICE = 415050;
const MILESTONE_PCT = 0.50;
const MILESTONE_AMT = FIXED_PRICE * MILESTONE_PCT; // 207525
const TODAY = "2026-03-22";

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
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) {
    console.log("ERROR:", JSON.stringify(json, null, 2));
    return { ok: false, status: r.status, data: json };
  }
  return { ok: true, status: r.status, data: json };
}

async function run() {
  // Step 1: GET project with expanded customer and PM
  const projRes = await api("GET", `/project?name=${encodeURIComponent(PROJ_NAME)}&count=50&fields=*,customer(*),projectManager(*)`);
  if (!projRes.ok) { console.log("FATAL: project search failed"); return; }

  const projects = projRes.data.values || [];
  // Find exact name match with correct customer org
  const proj = projects.find((p: any) =>
    p.name === PROJ_NAME &&
    p.customer?.organizationNumber === CUST_ORG
  );

  if (!proj) {
    console.log("FATAL: no matching project found for", PROJ_NAME, CUST_ORG);
    console.log("Found projects:", JSON.stringify(projects.map((p: any) => ({ id: p.id, name: p.name, custOrg: p.customer?.organizationNumber })), null, 2));
    return;
  }

  console.log("Found project:", proj.id, proj.name, "fixedprice:", proj.fixedprice, "isFixedPrice:", proj.isFixedPrice);
  console.log("Customer:", proj.customer?.id, proj.customer?.name, proj.customer?.organizationNumber);
  console.log("PM:", proj.projectManager?.id, proj.projectManager?.email);

  const customerId = proj.customer.id;
  const projectId = proj.id;
  const existingStartDate = proj.startDate;

  // Check if PM email matches
  const pmMatches = proj.projectManager?.email === PM_EMAIL;
  console.log("PM email matches:", pmMatches);

  // Check if fixed price already matches
  const fpMatches = proj.fixedprice === FIXED_PRICE && proj.isFixedPrice === true;
  console.log("Fixed price matches:", fpMatches);

  const needsUpdate = !fpMatches || !pmMatches;

  let pmId = proj.projectManager?.id;

  // If PM doesn't match, resolve
  if (!pmMatches) {
    const empRes = await api("GET", `/employee?email=${encodeURIComponent(PM_EMAIL)}&assignableProjectManagers=true&count=10&fields=*`);
    if (!empRes.ok) { console.log("FATAL: employee search failed"); return; }
    const emps = empRes.data.values || [];
    const emp = emps.find((e: any) => e.email === PM_EMAIL);
    if (!emp) { console.log("FATAL: no matching employee for", PM_EMAIL); return; }
    pmId = emp.id;
    console.log("Resolved PM:", pmId, emp.firstName, emp.lastName);
  }

  if (needsUpdate) {
    // Update-needed branch: parallel PUT project + GET vatType + GET bank account
    const [putProjRes, vatRes, bankRes] = await Promise.all([
      api("PUT", `/project/${projectId}`, {
        id: projectId,
        name: PROJ_NAME,
        startDate: existingStartDate,
        customer: { id: customerId },
        projectManager: { id: pmId },
        isFixedPrice: true,
        fixedprice: FIXED_PRICE,
        invoiceOnAccountVatHigh: false,
      }),
      api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
      api("GET", `/ledger/account?isBankAccount=true&fields=*`),
    ]);

    if (!putProjRes.ok) { console.log("FATAL: PUT project failed"); return; }
    console.log("Project updated: fixedprice =", putProjRes.data.value?.fixedprice, "isFixedPrice =", putProjRes.data.value?.isFixedPrice);

    if (!vatRes.ok) { console.log("FATAL: vatType search failed"); return; }
    const vatTypes = vatRes.data.values || [];
    // Prefer 25% row
    let vatType = vatTypes.find((v: any) => v.percentage === 25) || vatTypes[0];
    console.log("VAT type:", vatType?.id, vatType?.name, vatType?.percentage + "%");

    if (!bankRes.ok) { console.log("FATAL: bank account search failed"); return; }
    const bankAccounts = bankRes.data.values || [];
    const invoiceAcct = bankAccounts.find((a: any) => a.number === 1920) || bankAccounts[0];
    console.log("Invoice account:", invoiceAcct?.id, "number:", invoiceAcct?.number, "bankAccountNumber:", invoiceAcct?.bankAccountNumber);

    // Fix bank if missing
    if (invoiceAcct && !invoiceAcct.bankAccountNumber) {
      console.log("Bank account number missing, fixing...");
      const fixRes = await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
        id: invoiceAcct.id,
        number: invoiceAcct.number,
        name: invoiceAcct.name,
        bankAccountNumber: "12345678903",
      });
      if (!fixRes.ok) { console.log("FATAL: PUT bank account failed"); return; }
      console.log("Bank account fixed");
    }

    // POST invoice with embedded orders
    const invoiceRes = await api("POST", `/invoice?sendToCustomer=false`, {
      invoiceDate: TODAY,
      invoiceDueDate: TODAY,
      customer: { id: customerId },
      orders: [{
        customer: { id: customerId },
        project: { id: projectId },
        orderDate: TODAY,
        deliveryDate: TODAY,
        orderLines: [{
          description: `Meilensteinzahlung 50% - ${PROJ_NAME}`,
          count: 1,
          unitPriceExcludingVatCurrency: MILESTONE_AMT,
          vatType: { id: vatType.id },
        }],
      }],
    });

    if (!invoiceRes.ok) { console.log("FATAL: POST invoice failed"); return; }
    const inv = invoiceRes.data.value;
    console.log("Invoice created:", inv?.id, "invoiceNumber:", inv?.invoiceNumber);
    console.log("amountExcludingVatCurrency:", inv?.amountExcludingVatCurrency);
    console.log("amountCurrencyOutstanding:", inv?.amountCurrencyOutstanding);

    // Verification GETs (free)
    const [verifyInv, verifyProj] = await Promise.all([
      api("GET", `/invoice/${inv.id}?fields=*,orders(*,project(*),orderLines(*)),orderLines(*),customer(id,name,organizationNumber)`),
      api("GET", `/project/${projectId}?fields=*,customer(id,name)`),
    ]);
    if (verifyInv.ok) {
      const vi = verifyInv.data.value;
      console.log("VERIFY invoice:", vi?.invoiceNumber, "amount:", vi?.amountExcludingVatCurrency, "outstanding:", vi?.amountCurrencyOutstanding);
      console.log("VERIFY invoice customer:", vi?.customer?.name, vi?.customer?.organizationNumber);
    }
    if (verifyProj.ok) {
      const vp = verifyProj.data.value;
      console.log("VERIFY project:", vp?.name, "fixedprice:", vp?.fixedprice, "isFixedPrice:", vp?.isFixedPrice, "customer:", vp?.customer?.name);
    }

  } else {
    // Skip-PUT branch: just resolve VAT and create invoice
    const vatRes = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
    if (!vatRes.ok) { console.log("FATAL: vatType search failed"); return; }
    const vatTypes = vatRes.data.values || [];
    let vatType = vatTypes.find((v: any) => v.percentage === 25) || vatTypes[0];
    console.log("VAT type:", vatType?.id, vatType?.name, vatType?.percentage + "%");

    // Also proactively check bank on skip-PUT? Standard says no for skip-PUT branch.
    // POST invoice
    const invoiceRes = await api("POST", `/invoice?sendToCustomer=false`, {
      invoiceDate: TODAY,
      invoiceDueDate: TODAY,
      customer: { id: customerId },
      orders: [{
        customer: { id: customerId },
        project: { id: projectId },
        orderDate: TODAY,
        deliveryDate: TODAY,
        orderLines: [{
          description: `Meilensteinzahlung 50% - ${PROJ_NAME}`,
          count: 1,
          unitPriceExcludingVatCurrency: MILESTONE_AMT,
          vatType: { id: vatType.id },
        }],
      }],
    });

    if (!invoiceRes.ok) { console.log("FATAL: POST invoice failed"); return; }
    const inv = invoiceRes.data.value;
    console.log("Invoice created:", inv?.id, "invoiceNumber:", inv?.invoiceNumber);
    console.log("amountExcludingVatCurrency:", inv?.amountExcludingVatCurrency);
    console.log("amountCurrencyOutstanding:", inv?.amountCurrencyOutstanding);

    // Verification GETs (free)
    const [verifyInv, verifyProj] = await Promise.all([
      api("GET", `/invoice/${inv.id}?fields=*,orders(*,project(*),orderLines(*)),orderLines(*),customer(id,name,organizationNumber)`),
      api("GET", `/project/${projectId}?fields=*,customer(id,name)`),
    ]);
    if (verifyInv.ok) {
      const vi = verifyInv.data.value;
      console.log("VERIFY invoice:", vi?.invoiceNumber, "amount:", vi?.amountExcludingVatCurrency, "outstanding:", vi?.amountCurrencyOutstanding);
      console.log("VERIFY invoice customer:", vi?.customer?.name, vi?.customer?.organizationNumber);
    }
    if (verifyProj.ok) {
      const vp = verifyProj.data.value;
      console.log("VERIFY project:", vp?.name, "fixedprice:", vp?.fixedprice, "isFixedPrice:", vp?.isFixedPrice, "customer:", vp?.customer?.name);
    }
  }

  console.log("\nDONE");
}

run().catch(console.error);
