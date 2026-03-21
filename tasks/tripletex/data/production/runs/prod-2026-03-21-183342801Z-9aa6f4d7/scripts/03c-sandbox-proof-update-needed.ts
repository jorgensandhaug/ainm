// Proof: update-needed proactive-hedge branch — measure exact call count
// Uses sandbox fixture data (customer may differ from production)
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
  // --- MEASURED PATH STARTS ---

  // Call 1: GET /project — decisive project-first resolver
  const projData = await api("GET", `/project?name=${encodeURIComponent(PROJECT_NAME)}&count=50&fields=*,customer(*),projectManager(*)`);
  const match = (projData.values ?? []).find((p: any) => p.name === PROJECT_NAME);
  if (!match) throw new Error("Project not found");

  const projectId = match.id;
  const customerId = match.customer.id;
  const managerId = match.projectManager.id;
  const startDate = match.startDate;

  console.log(`  project=${projectId} customer=${customerId} manager=${managerId}`);
  console.log(`  current fixedprice=${match.fixedprice} isFixedPrice=${match.isFixedPrice}`);

  // Determine: needs PUT because fixedprice != 178450 or isFixedPrice != true
  const needsPut = match.fixedprice !== FIXED_PRICE || match.isFixedPrice !== true;
  console.log(`  needsPut=${needsPut}`);

  if (needsPut) {
    // Call 2: PUT /project — update fixed price
    const putResult = await api("PUT", `/project/${projectId}`, {
      id: projectId,
      name: PROJECT_NAME,
      startDate,
      customer: { id: customerId },
      projectManager: { id: managerId },
      isFixedPrice: true,
      fixedprice: FIXED_PRICE,
      invoiceOnAccountVatHigh: false,
    });
    console.log(`  Updated: fixedprice=${putResult.value.fixedprice}`);
  }

  // Call 3: GET /ledger/vatType
  const vatData = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
  const vatValues = vatData.values ?? [];
  const vat25 = vatValues.find((v: any) => v.percentage === 25);
  const vatType = vat25 ?? vatValues[0];
  console.log(`  VAT: id=${vatType.id} percentage=${vatType.percentage}%`);

  // Call 4: POST /order
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

  if (needsPut) {
    // Call 5: GET /ledger/account — proactive hedge (only on update-needed branch)
    const acctData = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
    const accts = acctData.values ?? [];
    const invoiceAcct = accts.find((a: any) => a.number === 1920);
    const bankConfigured = invoiceAcct && invoiceAcct.bankAccountNumber && invoiceAcct.bankAccountNumber.trim() !== "";
    console.log(`  Account 1920: bankNumber="${invoiceAcct?.bankAccountNumber}" configured=${bankConfigured}`);

    if (!bankConfigured && invoiceAcct) {
      // Call 6: PUT /ledger/account
      await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
        ...invoiceAcct,
        bankAccountNumber: "12345678903",
      });
      console.log(`  Fixed bank account`);
    }
  }

  // Final call: PUT /order/:invoice
  const invoiceResult = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
  const inv = invoiceResult.value;
  console.log(`  Invoice: id=${inv.id} amountExcludingVat=${inv.amountExcludingVatCurrency} outstanding=${inv.amountCurrencyOutstanding}`);

  console.log(`\n=== TOTAL MEASURED CALLS: ${callCount} ===`);
  console.log(`Branch: update-needed + proactive hedge`);
  console.log(`Expected: 6 (bank configured) or 7 (bank missing)`);
}

main().catch(e => { console.error(e); process.exit(1); });
