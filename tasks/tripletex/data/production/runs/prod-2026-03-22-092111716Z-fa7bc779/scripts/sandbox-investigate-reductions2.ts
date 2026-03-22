const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const AUTH = "Basic " + btoa("0:eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9");
const h = { "Content-Type": "application/json", Authorization: AUTH };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  console.log(`GET ${path} → ${r.status}`);
  return { ok: r.ok, status: r.status, data: b };
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  console.log(`POST ${path} → ${r.status}`, !r.ok ? JSON.stringify(b).slice(0,300) : "");
  return { ok: r.ok, status: r.status, data: b };
}
async function put(path: string, body?: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const b = await r.json();
  console.log(`PUT ${path} → ${r.status}`, !r.ok ? JSON.stringify(b).slice(0,300) : "");
  return { ok: r.ok, status: r.status, data: b };
}

async function main() {
  // Test 1: Check vatType id=3 details (correct fields)
  console.log("=== TEST 1: VatType id=3 ===");
  const vat3 = await get("/ledger/vatType/3?fields=id,name,percentage");
  console.log("  vatType 3:", JSON.stringify(vat3.data).slice(0, 300));

  // Test 2: Check if vatType 3 is ALWAYS the standard 25% outgoing
  console.log("\n=== TEST 2: All outgoing vatTypes ===");
  const TODAY = new Date().toISOString().slice(0, 10);
  const vatOut = await get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=" + TODAY + "&fields=id,name,percentage&count=10");
  console.log("  outgoing vatTypes:", JSON.stringify(vatOut.data.values?.map((v:any) => ({id:v.id, name:v.name, pct:v.percentage}))).slice(0, 500));

  // Test 3: Can we use vatType:{id:3} directly in POST /order without querying?
  // Create a dummy customer and order to test
  console.log("\n=== TEST 3: Order with hardcoded vatType 3 ===");
  const cust = await post("/customer", { name: "VatTest AS", organizationNumber: "000000000", isCustomer: true });
  if (!cust.ok) {
    console.log("  Customer creation failed, testing with existing...");
  }
  const custId = cust.ok ? cust.data.value.id : null;
  if (custId) {
    const ord = await post("/order", {
      customer: { id: custId },
      orderDate: TODAY, deliveryDate: TODAY,
      orderLines: [{
        description: "Test",
        count: 1,
        unitPriceExcludingVatCurrency: 1000,
        vatType: { id: 3 },
      }],
    });
    console.log("  Order with vatType 3:", ord.ok ? "OK" : "FAIL");
  }

  // Test 4: Can we skip GET /ledger/account and skip bank account setup entirely?
  // On fresh accounts, does invoice creation work without bank account number?
  // We can't test this properly in sandbox since bank acct is already set.
  // But on fresh accounts, the PUT is needed. The question is: can we skip the GET
  // and just always PUT with the bank account number?
  console.log("\n=== TEST 4: Check assignableProjectManagers ===");
  const pm = await get("/employee?assignableProjectManagers=true&count=1&fields=id,firstName,lastName");
  console.log("  PM:", JSON.stringify(pm.data.values).slice(0, 200));

  // Test 5: Can we merge GET /department + GET /employee?assignableProjectManagers into fewer calls?
  // These are different endpoints, so no. But can we combine the department GET with the customer POST?
  // They're already parallel in the current flow.

  // Test 6: In fresh accounts, the department GET returns the default "Avdeling" dept.
  // Could we create a project without projectManager and add PM via participant?
  console.log("\n=== TEST 6: Project without projectManager ===");
  const projNoPM = await post("/project", {
    name: "TestNoPM",
    startDate: TODAY,
    customer: { id: custId },
    isFixedPrice: true,
    fixedprice: 1000,
  });
  console.log("  Project without PM:", projNoPM.ok ? "OK" : "FAIL");
}

main().catch(e => console.error("FATAL:", e.message));
