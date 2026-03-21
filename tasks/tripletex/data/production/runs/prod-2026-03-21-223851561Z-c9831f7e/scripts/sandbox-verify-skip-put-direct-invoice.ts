// Sandbox verification: skip-PUT branch with direct POST /invoice
// When project already has correct fixedprice, skip PUT and go straight to vatType + invoice
// Expected: 3 calls (GET project + GET vatType + POST invoice)

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

// First, create a fixture project WITH correct fixedprice already set
console.log("=== FIXTURE SETUP (not counted) ===");

const custSearch = await get("/customer?name=SandboxDirectInv&count=10&fields=*");
const customerId = custSearch.values[0].id;
console.log(`Customer: ${customerId}`);

const pmRes = await get("/employee?assignableProjectManagers=true&count=1&fields=*");
const pmId = pmRes.values[0].id;
const pmEmail = pmRes.values[0].email;
console.log(`PM: id=${pmId}, email=${pmEmail}`);

// Create with fixedprice already set to target value
const projFixture = await post("/project", {
  name: "SandboxSkipPut " + Date.now(),
  startDate: TODAY,
  customer: { id: customerId },
  projectManager: { id: pmId },
  isFixedPrice: true,
  fixedprice: 292550,
});
const projName = projFixture.value.name;
console.log(`Fixture project: name=${projName}, fixedprice=${projFixture.value.fixedprice}, isFixedPrice=${projFixture.value.isFixedPrice}`);

// Now simulate the skip-PUT path
console.log("\n=== MEASURED RUN: skip-PUT path with direct POST /invoice ===");
calls = 0;

// Step 1: GET /project?name=...
const projSearch = await get(`/project?name=${encodeURIComponent(projName)}&count=50&fields=*,customer(*),projectManager(*)`);
const proj = projSearch.values.find((p: any) => p.name === projName);
if (!proj) throw new Error("Project not found!");
console.log(`Found: fixedprice=${proj.fixedprice}, isFixedPrice=${proj.isFixedPrice}, pm.email=${proj.projectManager?.email}`);

// Project already has correct state — skip PUT
// Step 2: GET vatType (no bank check needed on skip-PUT branch per standard)
const vatRes = await get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
const vatTypeId = vatRes.values[0].id;
console.log(`VAT type: id=${vatTypeId}`);

// Step 3: POST /invoice directly
const milestoneAmount = 292550 * 0.33;
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
console.log(`projectInvoiceDetails=${invoiceRes.value.projectInvoiceDetails?.length ?? "null"}`);
console.log(`\nTotal measured calls: ${calls}`);
console.log(`Expected: 3 (GET project + GET vatType + POST invoice)`);
