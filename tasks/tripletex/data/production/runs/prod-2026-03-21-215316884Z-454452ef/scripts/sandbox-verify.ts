// Sandbox verification: confirm POST /project/list with inline projectActivities still works
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

// 1. Get an assignable project manager
const empData = await get("/employee?assignableProjectManagers=true&count=1&fields=*");
const managerId = empData.values[0].id;
console.log(`Manager ID: ${managerId}`);

// 2. Test POST /project/list with inline projectActivities
const ts = Date.now();
const projects = [
  {
    name: `SB-Verify-${ts}`,
    startDate: "2026-03-21",
    isInternal: true,
    projectManager: { id: managerId },
    projectActivities: [{
      startDate: "2026-03-21",
      activity: {
        name: `SB-Verify-${ts}`,
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: false,
      },
    }],
  },
];

const result = await post("/project/list", projects);
console.log("\nCreated project:");
for (const proj of result.values) {
  console.log(`  Project ID=${proj.id}, name="${proj.name}", isInternal=${proj.isInternal}, manager=${proj.projectManager?.id}`);
  for (const pa of (proj.projectActivities || [])) {
    console.log(`    ProjectActivity ID=${pa.id}`);
  }
}

// 3. Verify the activity was created correctly via GET /activity
const paId = result.values[0].projectActivities[0].id;
const paDetail = await get(`/project/projectActivity/${paId}?fields=*,activity(*)`);
console.log(`\nActivity detail: name="${paDetail.value.activity?.name}", type="${paDetail.value.activity?.activityType}", chargeable=${paDetail.value.activity?.isChargeable}`);

console.log("\nSandbox verification complete.");
