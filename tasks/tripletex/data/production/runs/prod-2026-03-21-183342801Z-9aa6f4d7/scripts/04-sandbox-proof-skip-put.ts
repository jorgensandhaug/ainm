// Proof: skip-PUT branch — project already has correct fixedprice
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const HEADERS = { Authorization: AUTH, "Content-Type": "application/json" };

const PROJECT_NAME = "Skymigrering Reflection 9aa6f4d7";
const FIXED_PRICE = 178450;
const PARTIAL_AMOUNT = 89225; // 50%
const TODAY = "2026-03-21";

let callCount = 0;

async function api(method: string, path: string, body?: any) {
  callCount++;
  const url = `${BASE}${path}`;
  console.log(`[${callCount}] ${method} ${url}`);
  const r = await fetch(url, {
    method,
    headers: HEADERS,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  console.log(`  status=${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(data, null, 2)); throw new Error(`${method} failed ${r.status}`); }
  return data;
}

async function main() {
  // The fixture was already updated to fixedprice=178450 by the previous proof run.
  // So now the project already has the correct state → skip-PUT branch.

  // Call 1: GET /project — proves existing state is correct
  const projData = await api("GET", `/project?name=${encodeURIComponent(PROJECT_NAME)}&count=50&fields=*,customer(*),projectManager(*)`);
  const match = (projData.values ?? []).find((p: any) => p.name === PROJECT_NAME);
  if (!match) throw new Error("Project not found");

  const projectId = match.id;
  const customerId = match.customer.id;
  const managerId = match.projectManager.id;

  console.log(`  project=${projectId} fixedprice=${match.fixedprice} isFixedPrice=${match.isFixedPrice}`);
  console.log(`  manager email=${match.projectManager.email}`);

  const needsPut = match.fixedprice !== FIXED_PRICE || match.isFixedPrice !== true;
  console.log(`  needsPut=${needsPut} (should be false)`);

  // Call 2: GET /ledger/vatType
  const vatData = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
  const vatValues = vatData.values ?? [];
  const vat25 = vatValues.find((v: any) => v.percentage === 25);
  const vatType = vat25 ?? vatValues[0];
  console.log(`  VAT: id=${vatType.id} percentage=${vatType.percentage}%`);

  // Call 3: POST /order
  const orderResult = await api("POST", "/order", {
    customer: { id: customerId },
    project: { id: projectId },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [{
      description: `Delbetaling 50% fastpris – Skymigrering`,
      count: 1,
      unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
      vatType: { id: vatType.id },
    }],
  });
  const orderId = orderResult.value.id;
  console.log(`  order=${orderId}`);

  // NO proactive hedge on skip-PUT branch

  // Call 4: PUT /order/:invoice
  const invoiceResult = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
  const inv = invoiceResult.value;
  console.log(`  Invoice: id=${inv.id} amountExcludingVat=${inv.amountExcludingVatCurrency} outstanding=${inv.amountCurrencyOutstanding}`);

  console.log(`\n=== TOTAL MEASURED CALLS: ${callCount} ===`);
  console.log(`Branch: skip-PUT (project already at target state)`);
  console.log(`Expected: 4 calls`);
}

main().catch(e => { console.error(e); process.exit(1); });
