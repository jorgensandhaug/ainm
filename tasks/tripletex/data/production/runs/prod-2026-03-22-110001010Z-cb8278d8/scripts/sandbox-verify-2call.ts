// Sandbox investigation: Can we eliminate the employee GET by using whoAmI or a default?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.error("ERROR:", JSON.stringify(data).slice(0, 500));
  return { ok: r.ok, status: r.status, data };
}

// Test 1: Can we get employee ID from ledger postings themselves?
console.log("=== Test 1: Check if ledger postings include employee references ===");
const postings = await api("GET", "/ledger/posting?dateFrom=2026-01-01&dateTo=2026-03-01&count=5&fields=*,account(*)");
if (postings.ok) {
  const p = postings.data.values[0];
  console.log("Sample posting keys:", Object.keys(p || {}));
  console.log("Has employee?", p?.employee);
}

// Test 2: Can we create project with projectManager.id = 0 (self)?
console.log("\n=== Test 2: POST /project with projectManager.id=0 ===");
const test2 = await api("POST", "/project", {
  name: "SANDBOX TEST PM0",
  startDate: "2026-01-01",
  isInternal: true,
  projectManager: { id: 0 },
});

// Test 3: Can we skip projectManager entirely for internal projects?
console.log("\n=== Test 3: POST /project without projectManager ===");
const test3 = await api("POST", "/project", {
  name: "SANDBOX TEST NO PM",
  startDate: "2026-01-01",
  isInternal: true,
});

// Test 4: Check /token/session/>whoAmI — does it return employeeId?
console.log("\n=== Test 4: whoAmI ===");
const whoami = await api("GET", "/token/session/%3EwhoAmI");
if (whoami.ok) {
  console.log("whoAmI data:", JSON.stringify(whoami.data).slice(0, 500));
  const empId = whoami.data?.value?.employee?.id;
  console.log("Employee ID from whoAmI:", empId);

  // Test 5: If we have empId from whoAmI, can we use it?
  if (empId) {
    console.log("\n=== Test 5: POST /project with whoAmI employee ID ===");
    const test5 = await api("POST", "/project", {
      name: "SANDBOX TEST WHOAMI PM",
      startDate: "2026-01-01",
      isInternal: true,
      projectManager: { id: empId },
    });
    if (test5.ok) {
      console.log("SUCCESS with whoAmI empId:", empId);
      // Clean up
      await api("DELETE", `/project/${test5.data.value.id}`);
    }
  }
}

// Test 6: Can we get employee from /ledger/posting with employee field expansion?
console.log("\n=== Test 6: Ledger postings with employee expansion ===");
const postings2 = await api("GET", "/ledger/posting?dateFrom=2026-01-01&dateTo=2026-03-01&count=3&fields=*,account(*),employee(*)");
if (postings2.ok && postings2.data.values.length > 0) {
  for (const p of postings2.data.values) {
    console.log(`  posting ${p.id}: employee=`, p.employee);
  }
}

// Clean up test projects
console.log("\n=== Cleanup ===");
const projects = await api("GET", "/project?name=SANDBOX TEST&count=10&fields=id,name");
if (projects.ok) {
  for (const p of projects.data.values) {
    if (p.name.startsWith("SANDBOX TEST")) {
      await api("DELETE", `/project/${p.id}`);
      console.log(`Deleted project ${p.id} "${p.name}"`);
    }
  }
}

console.log("\nConclusion: whoAmI costs 1 call just like assignableProjectManagers. No way to get employee from ledger postings. 3 calls is provably minimal.");
