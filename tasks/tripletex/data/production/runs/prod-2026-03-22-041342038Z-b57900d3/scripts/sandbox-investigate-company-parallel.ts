// Investigate: can we GET /company without an ID to get the current company?
// If yes, we could parallelize it with round-1 GETs and avoid the conditional round-2 GET.
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function tryGet(path: string) {
  const r = await fetch(BASE + path, { headers: H });
  console.log(`GET ${path} → ${r.status}`);
  if (r.ok) {
    const data = await r.json();
    return data;
  } else {
    console.log("  Error:", (await r.text()).slice(0, 200));
    return null;
  }
}

async function main() {
  // Test 1: GET /company with no ID - does it return current company?
  console.log("=== Test 1: GET /company (no ID) ===");
  const companyList = await tryGet("/company?fields=*,address(*)");
  if (companyList?.value) {
    console.log("  Company:", companyList.value.id, companyList.value.name);
    console.log("  Address city:", companyList.value.address?.city);
  } else if (companyList?.values) {
    console.log("  Values count:", companyList.values.length);
    for (const c of companyList.values) {
      console.log("  Company:", c.id, c.name, "city:", c.address?.city);
    }
  }

  // Test 2: GET /company/withLoginAccess
  console.log("\n=== Test 2: GET /company/withLoginAccess ===");
  const loginAccess = await tryGet("/company/withLoginAccess?fields=*,address(*)");
  if (loginAccess?.values) {
    for (const c of loginAccess.values) {
      console.log("  Company:", c.id, c.name, "city:", c.address?.city);
    }
  }

  // Test 3: Check employee address in sandbox
  console.log("\n=== Test 3: employee address check ===");
  const empRes = await tryGet("/employee?count=5&fields=*");
  if (empRes?.values) {
    for (const e of empRes.values) {
      console.log(`  Employee ${e.id} ${e.firstName} ${e.lastName}: address=${JSON.stringify(e.address?.city ?? null)}, companyId=${e.companyId}`);
    }
  }
}

main().catch(e => console.error("FATAL:", e));
