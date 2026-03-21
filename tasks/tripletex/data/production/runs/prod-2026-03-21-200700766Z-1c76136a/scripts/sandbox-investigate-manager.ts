const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  if (!r.ok) {
    const t = await r.text();
    console.log(`GET ${path} → ${r.status}: ${t}`);
    return null;
  }
  return r.json();
}

// Test 1: Can /token/session/>whoAmI give us a usable employee ID?
const whoAmI = await get("/token/session/%3EwhoAmI");
console.log("=== whoAmI ===");
console.log(JSON.stringify(whoAmI, null, 2));

// Test 2: Check if ledger postings contain employee info we could reuse
const ledger = await get("/ledger/posting?dateFrom=2026-01-01&dateTo=2026-03-01&count=5&fields=*,account(*),employee(*)");
console.log("\n=== First 5 ledger postings (with employee) ===");
if (ledger?.values) {
  for (const p of ledger.values.slice(0, 3)) {
    console.log(`  employee: ${JSON.stringify(p.employee)}`);
  }
}

// Test 3: What does assignableProjectManagers return?
const managers = await get("/employee?assignableProjectManagers=true&count=5&fields=id,firstName,lastName");
console.log("\n=== Assignable project managers ===");
console.log(JSON.stringify(managers?.values, null, 2));
