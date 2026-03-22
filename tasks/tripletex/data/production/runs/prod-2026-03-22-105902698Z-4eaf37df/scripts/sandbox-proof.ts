// Sandbox proof: verify the POST /invoice path for the same task shape
// Cascade SARL / 813648164 / 326550 / 75% = 244912.5
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const PROJECT_NAME = "Cascade Proof 4eaf37df";
const FIXED_PRICE = 326550;
const MILESTONE_AMOUNT = FIXED_PRICE * 0.75; // 244912.5

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
  console.log("=== SANDBOX PROOF: POST /invoice optimization for update-needed path ===\n");

  // Fixture setup: create customer + project (not counted as part of scored path)
  const [pm, dept] = await Promise.all([
    get("/employee?assignableProjectManagers=true&count=1&fields=*"),
    get("/department?isInactive=false&count=1&fields=*"),
  ]);
  const pmId = pm.values[0].id;
  const deptId = dept.values[0].id;

  const cust = await post("/customer", { name: "Cascade Proof SARL", organizationNumber: "813648164", isCustomer: true });
  const custId = cust.value.id;

  const proj = await post("/project", {
    name: PROJECT_NAME,
    startDate: TODAY,
    customer: { id: custId },
    projectManager: { id: pmId },
    isFixedPrice: false,
    fixedprice: 0,
  });
  const projId = proj.value.id;
  console.log(`Fixture: project ${projId}, customer ${custId}, PM ${pmId}`);

  // ═══════════════════════════════════════════════════════════════
  // SCORED PATH BEGINS HERE — count writes only
  // ═══════════════════════════════════════════════════════════════
  let writeCount = 0;

  // Step 1: GET /project (free)
  const projRes = await get(`/project/${projId}?fields=*,customer(*),projectManager(*)`);
  console.log(`\nStep 1 (GET, free): project fixedprice=${projRes.value.fixedprice}, isFixedPrice=${projRes.value.isFixedPrice}`);

  // Step 2: parallel PUT /project + GET vatType + GET /ledger/account
  const [projUpdate, vatRes, bankRes] = await Promise.all([
    put(`/project/${projId}`, {
      name: PROJECT_NAME,
      startDate: projRes.value.startDate,
      customer: { id: custId },
      projectManager: { id: pmId },
      isFixedPrice: true,
      fixedprice: FIXED_PRICE,
      invoiceOnAccountVatHigh: false,
    }),
    get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
    get("/ledger/account?isBankAccount=true&fields=*"),
  ]);
  writeCount++;
  console.log(`\nStep 2: PUT /project (write #${writeCount}): fixedprice=${projUpdate.value.fixedprice}`);

  const vat25 = vatRes.values?.find((v: any) => v.percentage === 25);
  const vatId = vat25?.id || vatRes.values?.[0]?.id;
  console.log(`Step 2: GET vatType (free): id=${vatId}, pct=${vat25?.percentage || vatRes.values?.[0]?.percentage}`);

  const bankAcct = bankRes.values?.find((a: any) => a.number === 1920) || bankRes.values?.[0];
  console.log(`Step 2: GET bank (free): acct=${bankAcct?.number}, bankNumber=${bankAcct?.bankAccountNumber || '(missing)'}`);

  // Step 3: conditional PUT bank
  if (bankAcct && !bankAcct.bankAccountNumber) {
    await put(`/ledger/account/${bankAcct.id}`, { ...bankAcct, bankAccountNumber: "12345678903" });
    writeCount++;
    console.log(`\nStep 3: PUT bank (write #${writeCount}): fixed`);
  } else {
    console.log(`\nStep 3: bank already configured, skipped`);
  }

  // Step 4: POST /invoice
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
  writeCount++;
  console.log(`\nStep 4: POST /invoice (write #${writeCount}): id=${invRes.value.id}, amountExcVat=${invRes.value.amountExcludingVatCurrency}, outstanding=${invRes.value.amountCurrencyOutstanding}`);

  // Verification (free)
  const invFull = await get(`/invoice/${invRes.value.id}?fields=*,orders(*,project(*),orderLines(*)),orderLines(*),customer(id,name,organizationNumber)`);
  console.log(`\nVerification (free): invoiceNumber=${invFull.value.invoiceNumber}, amountExcVat=${invFull.value.amountExcludingVatCurrency}`);
  console.log(`  customer: ${invFull.value.customer?.name} (${invFull.value.customer?.organizationNumber})`);
  console.log(`  orders[0].project.id: ${invFull.value.orders?.[0]?.project?.id}`);
  console.log(`  orders[0].project.fixedprice: ${invFull.value.orders?.[0]?.project?.fixedprice}`);

  const projFinal = await get(`/project/${projId}?fields=*,customer(id,name)`);
  console.log(`  project.fixedprice: ${projFinal.value.fixedprice}, isFixedPrice: ${projFinal.value.isFixedPrice}`);

  console.log(`\n=== TOTAL WRITES: ${writeCount} ===`);
  console.log(`Expected milestone: ${MILESTONE_AMOUNT}`);
  console.log(`Actual amountExcludingVatCurrency: ${invFull.value.amountExcludingVatCurrency}`);
  console.log(`Match: ${invFull.value.amountExcludingVatCurrency === MILESTONE_AMOUNT}`);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
