const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.log(JSON.stringify(json, null, 2));
  return { status: r.status, json };
}

// Test 1: Can we get employeeId from whoAmI?
console.log("=== Test 1: /token/session/>whoAmI ===");
const whoAmI = await api("GET", "/token/session/%3EwhoAmI");
if (whoAmI.status === 200) {
  console.log("employeeId:", whoAmI.json.value?.employeeId);
  console.log("employee:", JSON.stringify(whoAmI.json.value?.employee, null, 2));
}

// Test 2: Can we create project without projectManager?
console.log("\n=== Test 2: POST /project without projectManager ===");
const noMgr = await api("POST", "/project", {
  name: "Test No Manager",
  startDate: "2026-03-22",
  isInternal: true,
});

// Test 3: Can we create project with projectManager.id from whoAmI?
if (whoAmI.status === 200 && whoAmI.json.value?.employeeId) {
  const empId = whoAmI.json.value.employeeId;
  console.log(`\n=== Test 3: POST /project with whoAmI employeeId=${empId} ===`);
  const withMgr = await api("POST", "/project", {
    name: "Test WhoAmI Manager " + Date.now(),
    startDate: "2026-03-22",
    isInternal: true,
    projectManager: { id: empId },
  });
  if (withMgr.status === 201) {
    console.log("Created project:", withMgr.json.value?.id, withMgr.json.value?.name);
  }
}

// Test 4: Does the ledger posting response include any employee reference we could reuse?
console.log("\n=== Test 4: Check if ledger postings contain employee references ===");
const postings = await api("GET", "/ledger/posting?dateFrom=2026-01-01&dateTo=2026-03-01&count=3&fields=*,account(*)");
if (postings.status === 200) {
  const p = postings.json.values?.[0];
  console.log("Sample posting keys:", Object.keys(p || {}));
  console.log("employee field:", p?.employee);
}

// Test 5: Can the ledger query also embed employee info via fields param?
console.log("\n=== Test 5: GET /ledger/posting with employee expansion ===");
const postingsWithEmp = await api("GET", "/ledger/posting?dateFrom=2026-01-01&dateTo=2026-03-01&count=1&fields=*,account(*),employee(*)");
if (postingsWithEmp.status === 200) {
  const p = postingsWithEmp.json.values?.[0];
  console.log("employee field:", JSON.stringify(p?.employee, null, 2));
}
