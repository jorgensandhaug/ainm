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
  console.log(`POST ${path} → ${r.status}`);
  if (!r.ok) console.log("  error:", JSON.stringify(b).slice(0, 300));
  return { ok: r.ok, status: r.status, data: b };
}

async function main() {
  // Test 1: Can we create employee WITHOUT department?
  console.log("=== TEST 1: Employee without department ===");
  const empNoDept = await post("/employee", {
    firstName: "TestNoDept", lastName: "Test", email: "testnodept@test.org",
    dateOfBirth: "1990-01-01", userType: "NO_ACCESS"
  });
  console.log("  result:", empNoDept.ok ? "OK (dept not required)" : "FAIL (dept required)");

  // Test 2: Check vatType id=3 consistency
  console.log("\n=== TEST 2: VatType id=3 check ===");
  const vat = await get("/ledger/vatType/3?fields=id,name,percentage,typeOfVat");
  console.log("  vatType 3:", JSON.stringify(vat.data).slice(0, 200));

  // Test 3: Can we use vatType id=3 directly in order without GET?
  // (just confirming the structure)
  console.log("\n=== TEST 3: Check default department ===");
  const depts = await get("/department?isInactive=false&count=5&fields=id,name,departmentNumber");
  console.log("  departments:", JSON.stringify(depts.data.values).slice(0, 300));

  // Test 4: Check if bank account 1920 already has bankAccountNumber in sandbox
  console.log("\n=== TEST 4: Account 1920 bank number ===");
  const acct = await get("/ledger/account?number=1920&fields=id,number,name,isBankAccount,bankAccountNumber");
  console.log("  account 1920:", JSON.stringify(acct.data.values).slice(0, 300));

  // Test 5: Check if we can create employee with department:{id:0} or omit department entirely
  console.log("\n=== TEST 5: Employee batch without department ===");
  const empBatch = await post("/employee/list", [
    { firstName: "BatchNoDept1", lastName: "Test", email: "batchnodept1@test.org", dateOfBirth: "1990-01-01", userType: "NO_ACCESS" },
  ]);
  console.log("  result:", empBatch.ok ? "OK" : "FAIL");
  if (empBatch.ok) {
    console.log("  emp data:", JSON.stringify(empBatch.data.values[0]).slice(0, 200));
  }
}

main().catch(e => console.error("FATAL:", e.message));
