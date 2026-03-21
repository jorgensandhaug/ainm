// Test: can we skip GET /ledger/vatType by omitting vatType on invoice orderLine?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const TODAY = "2026-03-22";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, data: json };
}

async function run() {
  const rnd = Math.floor(Math.random() * 100000000);

  // Step 1: Get dept + create customer + get PM (parallel)
  const [deptR, custR, pmR] = await Promise.all([
    api("GET", "/department?isInactive=false&count=1&fields=*"),
    api("POST", "/customer", { name: `VatTest ${rnd} AS`, organizationNumber: "905570862" }),
    api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
  ]);

  const deptId = deptR.data.values?.[0]?.id;
  const custId = custR.data.value?.id;
  const pmId = pmR.data.values?.[0]?.id;
  console.log("dept:", deptId, "cust:", custId, "pm:", pmId);

  // Step 2: Create project
  const projR = await api("POST", "/project", {
    name: `VatTest Project ${rnd}`,
    startDate: TODAY,
    customer: { id: custId },
    projectManager: { id: pmId },
    isFixedPrice: true,
    fixedprice: 100000,
  });
  const projId = projR.data.value?.id;
  console.log("project:", projId);

  // Step 3: Get bank account
  const accR = await api("GET", "/ledger/account?number=1920&fields=id,number,bankAccountNumber");
  const acc1920 = accR.data.values?.[0];
  console.log("acc1920:", acc1920);

  // Fix bank account if needed
  if (acc1920 && !acc1920.bankAccountNumber) {
    const fixR = await api("PUT", `/ledger/account/${acc1920.id}`, { id: acc1920.id, number: acc1920.number, bankAccountNumber: "12345678903" });
    console.log("bank fix:", fixR.status);
  }

  // Test invoice WITHOUT vatType on orderLine
  const invR = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: "2026-04-05",
    customer: { id: custId },
    orders: [{
      customer: { id: custId },
      project: { id: projId },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: "Test without vatType",
        count: 1,
        unitPriceExcludingVatCurrency: 100000,
        // NO vatType specified
      }]
    }]
  });
  console.log("invoice without vatType:", invR.status, JSON.stringify(invR.data).slice(0, 500));
}

run().catch(e => console.error(e));
