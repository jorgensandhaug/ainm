// Sandbox verification: update-needed path with direct POST /invoice
// Goal: prove that GET /project → PUT /project → GET vatType + GET account (parallel) → POST /invoice works in 5-6 calls
// Uses existing sandbox fixtures (project, customer, PM must already exist from prior tests)

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";
const H = { Authorization: AUTH, "Content-Type": "application/json" };
let calls = 0;

async function get(p: string) {
  calls++;
  const r = await fetch(`${BASE}${p}`, { headers: H });
  const t = await r.text();
  console.log(`GET ${p}: ${r.status}`);
  if (!r.ok) throw new Error(`GET ${p}: ${r.status} ${t}`);
  return JSON.parse(t);
}

async function post(p: string, body: any) {
  calls++;
  const r = await fetch(`${BASE}${p}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const t = await r.text();
  console.log(`POST ${p}: ${r.status}`);
  if (!r.ok) throw new Error(`POST ${p}: ${r.status} ${t}`);
  return JSON.parse(t);
}

async function put(p: string, body: any) {
  calls++;
  const r = await fetch(`${BASE}${p}`, { method: "PUT", headers: H, body: JSON.stringify(body) });
  const t = await r.text();
  console.log(`PUT ${p}: ${r.status}`);
  if (!r.ok) throw new Error(`PUT ${p}: ${r.status} ${t}`);
  return JSON.parse(t);
}

// First, create a fixture project for testing
console.log("=== FIXTURE SETUP (not counted) ===");

// Get existing customer or create one
const custSearch = await get("/customer?name=SandboxDirectInv&count=10&fields=*");
let customerId: number;
if (custSearch.count > 0) {
  customerId = custSearch.values[0].id;
  console.log(`Reusing customer ${customerId}`);
} else {
  const custRes = await post("/customer", {
    name: "SandboxDirectInv GmbH",
    organizationNumber: "999887766",
    isCustomer: true,
  });
  customerId = custRes.value.id;
  console.log(`Created customer ${customerId}`);
}

// Get assignable PM
const pmRes = await get("/employee?assignableProjectManagers=true&count=1&fields=*");
const pmId = pmRes.values[0].id;
const pmEmail = pmRes.values[0].email;
console.log(`PM: id=${pmId}, email=${pmEmail}`);

// Create a project with fixedprice=0 (to simulate "needs update" state)
const projFixture = await post("/project", {
  name: "SandboxDirectInv " + Date.now(),
  startDate: TODAY,
  customer: { id: customerId },
  projectManager: { id: pmId },
  isFixedPrice: false,
  fixedprice: 0,
});
const projName = projFixture.value.name;
const projectId = projFixture.value.id;
console.log(`Created fixture project: id=${projectId}, name=${projName}, fixedprice=${projFixture.value.fixedprice}`);

// Now simulate the standard flow from scratch
console.log("\n=== MEASURED RUN: update-needed path with direct POST /invoice ===");
calls = 0;

// Step 1: GET /project?name=...
const projSearch = await get(`/project?name=${encodeURIComponent(projName)}&count=50&fields=*,customer(*),projectManager(*)`);
const proj = projSearch.values.find((p: any) => p.name === projName);
if (!proj) throw new Error("Project not found!");
console.log(`Found project: id=${proj.id}, fixedprice=${proj.fixedprice}, customer.orgNr=${proj.customer?.organizationNumber}, pm.email=${proj.projectManager?.email}`);

// Step 2: PUT /project + GET vatType + GET account (parallel)
const [putProjRes, vatRes, accRes] = await Promise.all([
  put(`/project/${proj.id}`, {
    name: proj.name,
    startDate: proj.startDate,
    customer: { id: proj.customer.id },
    projectManager: { id: proj.projectManager.id },
    isFixedPrice: true,
    fixedprice: 292550,
    invoiceOnAccountVatHigh: false,
  }),
  get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
  get("/ledger/account?isBankAccount=true&fields=*"),
]);

console.log(`PUT /project: fixedprice=${putProjRes.value.fixedprice}, isFixedPrice=${putProjRes.value.isFixedPrice}`);
const vatTypeId = vatRes.values[0].id;
console.log(`VAT type: id=${vatTypeId}, percentage=${vatRes.values[0].percentage}`);
const acc1920 = accRes.values.find((a: any) => a.number === 1920);
console.log(`Bank account 1920: id=${acc1920?.id}, bankAccountNumber=${acc1920?.bankAccountNumber}`);

// Step 3: conditional bank fix
if (acc1920 && !acc1920.bankAccountNumber) {
  await put(`/ledger/account/${acc1920.id}`, { bankAccountNumber: "12345678903" });
  console.log("Bank fix applied");
}

// Step 4: POST /invoice?sendToCustomer=false (DIRECT invoice, not POST /order + PUT /order/:invoice)
const milestoneAmount = 292550 * 0.33; // 96541.5
const invoiceRes = await post("/invoice?sendToCustomer=false", {
  invoiceDate: TODAY,
  invoiceDueDate: "2026-04-04",
  customer: { id: proj.customer.id },
  orders: [
    {
      customer: { id: proj.customer.id },
      project: { id: proj.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [
        {
          description: "Meilensteinzahlung (33%)",
          count: 1,
          unitPriceExcludingVatCurrency: milestoneAmount,
          vatType: { id: vatTypeId },
        },
      ],
    },
  ],
});

console.log("\n=== RESULT ===");
console.log(`Invoice: id=${invoiceRes.value.id}, number=${invoiceRes.value.invoiceNumber}`);
console.log(`amountExcludingVatCurrency=${invoiceRes.value.amountExcludingVatCurrency}`);
console.log(`amount=${invoiceRes.value.amount}`);
console.log(`projectInvoiceDetails=${invoiceRes.value.projectInvoiceDetails?.length ?? "null"}`);
console.log(`\nTotal measured calls: ${calls}`);
