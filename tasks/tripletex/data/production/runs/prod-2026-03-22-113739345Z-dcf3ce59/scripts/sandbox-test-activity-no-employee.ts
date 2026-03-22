// Test: can GET /activity/>forTimeSheet work without employeeId?
// If yes, we could move it to step 1 (parallel with employee GET) and reduce sequential steps.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  console.log(`GET ${path} → ${r.status}`);
  const body = await r.text();
  try { return JSON.parse(body); } catch { return body; }
}

// Known sandbox project: "Sandbox Hour Invoice Project 1774020541520" (used in previous proofs)
// First, find a project to get its ID
const projRes = await get("/project?name=Sandbox%20Hour%20Invoice%20Project&count=10&fields=id,name");
console.log("Projects:", JSON.stringify(projRes, null, 2));

if (projRes.values?.length > 0) {
  const projId = projRes.values[0].id;

  // Test 1: activity GET WITH employeeId (baseline)
  const empRes = await get("/employee?count=1&fields=id,email");
  const empId = empRes.values?.[0]?.id;
  console.log("\nEmployee:", empId);

  const act1 = await get(`/activity/%3EforTimeSheet?projectId=${projId}&employeeId=${empId}&date=2026-03-22&query=&filterExistingHours=false&count=50&fields=*`);
  console.log("\nWith employeeId:", JSON.stringify(act1.values?.map((a: any) => ({ id: a.id, name: a.name, isChargeable: a.isChargeable })), null, 2));

  // Test 2: activity GET WITHOUT employeeId
  const act2 = await get(`/activity/%3EforTimeSheet?projectId=${projId}&date=2026-03-22&query=&filterExistingHours=false&count=50&fields=*`);
  console.log("\nWithout employeeId:", JSON.stringify(act2, null, 2));
} else {
  console.log("No sandbox project found, skipping test");
}
