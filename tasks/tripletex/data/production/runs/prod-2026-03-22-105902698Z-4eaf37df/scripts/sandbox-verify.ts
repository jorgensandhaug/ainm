const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "tvBiInoGiHVCrivtpVkvcH8bQfPmz3h8q1EArCiJkp8";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const PROJECT_NAME = "Projet d'automatisation";
const CUST_ORG = "813648164";
const PM_EMAIL = "hugo.bernard@example.org";
const FIXED_PRICE = 326550;
const MILESTONE_PCT = 0.75;
const MILESTONE_AMOUNT = FIXED_PRICE * MILESTONE_PCT; // 244912.5

const TODAY = new Date().toISOString().slice(0, 10);
const h = { "Content-Type": "application/json", Authorization: AUTH };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  if (!r.ok) throw new Error(`GET ${path} ${r.status}: ${JSON.stringify(b).slice(0, 300)}`);
  return b;
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) throw new Error(`POST ${path} ${r.status}: ${JSON.stringify(b).slice(0, 300)}`);
  return b;
}
async function put(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) throw new Error(`PUT ${path} ${r.status}: ${JSON.stringify(b).slice(0, 300)}`);
  return b;
}

async function main() {
  // ═══════════════════════════════════════════════════════════════
  // STEP 1: Decisive project-first read with expanded customer + PM
  // ═══════════════════════════════════════════════════════════════
  const projRes = await get(`/project?name=${encodeURIComponent(PROJECT_NAME)}&count=50&fields=*,customer(*),projectManager(*)`);

  // Find exact match by name + customer org
  const proj = projRes.values?.find((p: any) =>
    p.name === PROJECT_NAME && p.customer?.organizationNumber === CUST_ORG
  );
  if (!proj) throw new Error(`Project "${PROJECT_NAME}" with customer org ${CUST_ORG} not found`);

  const projId = proj.id;
  const custId = proj.customer.id;
  const startDate = proj.startDate;
  const pmMatches = proj.projectManager?.email === PM_EMAIL;
  const fixedPriceMatches = proj.fixedprice === FIXED_PRICE && proj.isFixedPrice === true;

  console.log(`Project found: id=${projId}, customer=${custId}, fixedprice=${proj.fixedprice}, isFixedPrice=${proj.isFixedPrice}, PM email=${proj.projectManager?.email}`);
  console.log(`PM matches: ${pmMatches}, fixedPrice matches: ${fixedPriceMatches}`);

  const needsUpdate = !fixedPriceMatches;
  let pmId = proj.projectManager?.id;

  // If PM doesn't match, resolve separately
  if (!pmMatches) {
    const empRes = await get(`/employee?email=${encodeURIComponent(PM_EMAIL)}&assignableProjectManagers=true&count=10&fields=*`);
    const emp = empRes.values?.find((e: any) => e.email === PM_EMAIL);
    if (!emp) throw new Error(`PM with email ${PM_EMAIL} not found as assignable project manager`);
    pmId = emp.id;
  }

  if (needsUpdate) {
    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Update-needed branch — parallel PUT project + GET vatType + GET bank account
    // ═══════════════════════════════════════════════════════════════
    const [projUpdate, vatRes, bankRes] = await Promise.all([
      put(`/project/${projId}`, {
        name: PROJECT_NAME,
        startDate: startDate,
        customer: { id: custId },
        projectManager: { id: pmId },
        isFixedPrice: true,
        fixedprice: FIXED_PRICE,
        invoiceOnAccountVatHigh: false,
      }),
      get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
      get("/ledger/account?isBankAccount=true&fields=*"),
    ]);

    console.log(`Project updated: fixedprice=${projUpdate.value.fixedprice}, isFixedPrice=${projUpdate.value.isFixedPrice}`);

    // Resolve VAT — prefer 25% if present
    const vat25 = vatRes.values?.find((v: any) => v.percentage === 25);
    const vatId = vat25?.id || vatRes.values?.[0]?.id;
    console.log(`VAT resolved: id=${vatId}, percentage=${vat25?.percentage || vatRes.values?.[0]?.percentage}`);

    // Check bank account — fix if missing
    const bankAcct = bankRes.values?.find((a: any) => a.number === 1920) || bankRes.values?.[0];
    if (bankAcct && !bankAcct.bankAccountNumber) {
      console.log(`Bank account ${bankAcct.number} missing bankAccountNumber — fixing...`);
      await put(`/ledger/account/${bankAcct.id}`, { ...bankAcct, bankAccountNumber: "12345678903" });
      console.log("Bank account fixed");
    } else {
      console.log(`Bank account configured: ${bankAcct?.bankAccountNumber}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Create invoice with embedded order
    // ═══════════════════════════════════════════════════════════════
    const invRes = await post("/invoice?sendToCustomer=false", {
      invoiceDate: TODAY,
      invoiceDueDate: TODAY,
      customer: { id: custId },
      orders: [{
        customer: { id: custId },
        project: { id: projId },
        orderDate: TODAY,
        deliveryDate: TODAY,
        orderLines: [{
          description: PROJECT_NAME,
          count: 1,
          unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
          vatType: { id: vatId },
        }],
      }],
    });

    console.log(`Invoice created: id=${invRes.value.id}, amountExcludingVat=${invRes.value.amountExcludingVatCurrency}, outstanding=${invRes.value.amountCurrencyOutstanding}`);

    // Verification GETs (free)
    const [invFull, projFull] = await Promise.all([
      get(`/invoice/${invRes.value.id}?fields=*,orders(*,project(*),orderLines(*)),orderLines(*),customer(id,name,organizationNumber)`),
      get(`/project/${projId}?fields=*,customer(id,name)`),
    ]);
    console.log("\n=== VERIFICATION ===");
    console.log("INVOICE:", JSON.stringify({
      id: invFull.value.id,
      invoiceNumber: invFull.value.invoiceNumber,
      amountExcludingVatCurrency: invFull.value.amountExcludingVatCurrency,
      amountCurrencyOutstanding: invFull.value.amountCurrencyOutstanding,
      customer: invFull.value.customer,
    }, null, 2));
    console.log("PROJECT:", JSON.stringify({
      id: projFull.value.id,
      name: projFull.value.name,
      fixedprice: projFull.value.fixedprice,
      isFixedPrice: projFull.value.isFixedPrice,
      customer: projFull.value.customer,
    }, null, 2));

  } else {
    // ═══════════════════════════════════════════════════════════════
    // Skip-PUT branch — project already correct, just invoice
    // ═══════════════════════════════════════════════════════════════
    const vatRes = await get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
    const vat25 = vatRes.values?.find((v: any) => v.percentage === 25);
    const vatId = vat25?.id || vatRes.values?.[0]?.id;
    console.log(`VAT resolved: id=${vatId}, percentage=${vat25?.percentage || vatRes.values?.[0]?.percentage}`);

    const invRes = await post("/invoice?sendToCustomer=false", {
      invoiceDate: TODAY,
      invoiceDueDate: TODAY,
      customer: { id: custId },
      orders: [{
        customer: { id: custId },
        project: { id: projId },
        orderDate: TODAY,
        deliveryDate: TODAY,
        orderLines: [{
          description: PROJECT_NAME,
          count: 1,
          unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
          vatType: { id: vatId },
        }],
      }],
    });

    console.log(`Invoice created: id=${invRes.value.id}, amountExcludingVat=${invRes.value.amountExcludingVatCurrency}, outstanding=${invRes.value.amountCurrencyOutstanding}`);

    // Verification GET (free)
    const invFull = await get(`/invoice/${invRes.value.id}?fields=*,orders(*,project(*),orderLines(*)),orderLines(*),customer(id,name,organizationNumber)`);
    console.log("\n=== VERIFICATION ===");
    console.log("INVOICE:", JSON.stringify({
      id: invFull.value.id,
      invoiceNumber: invFull.value.invoiceNumber,
      amountExcludingVatCurrency: invFull.value.amountExcludingVatCurrency,
      amountCurrencyOutstanding: invFull.value.amountCurrencyOutstanding,
      customer: invFull.value.customer,
    }, null, 2));
  }
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
