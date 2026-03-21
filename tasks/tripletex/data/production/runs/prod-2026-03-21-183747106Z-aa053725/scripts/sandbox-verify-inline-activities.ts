const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`\n${method} ${url}`);
  const res = await fetch(url, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`HTTP ${res.status}`);
  if (!res.ok) {
    console.error(JSON.stringify(data, null, 2));
  }
  return { ok: res.ok, status: res.status, data };
}

// Step 1: Get an assignable project manager
const empRes = await api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*");
const managerId = empRes.data.values[0].id;
console.log(`Manager id: ${managerId}`);

// Step 2: Create 2 test projects with inline projectActivities via POST /project/list
const ts = Date.now().toString().slice(-6);
const projectPayload = [
  {
    name: `SB Test ${ts} A`,
    startDate: "2026-03-21",
    isInternal: true,
    projectManager: { id: managerId },
    projectActivities: [{
      startDate: "2026-03-21",
      activity: {
        name: `SB Test ${ts} A`,
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: false,
      },
    }],
  },
  {
    name: `SB Test ${ts} B`,
    startDate: "2026-03-21",
    isInternal: true,
    projectManager: { id: managerId },
    projectActivities: [{
      startDate: "2026-03-21",
      activity: {
        name: `SB Test ${ts} B`,
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: false,
      },
    }],
  },
];

const createRes = await api("POST", "/project/list", projectPayload);
console.log("\nFull create response:");
console.log(JSON.stringify(createRes.data, null, 2));

// Step 3: Inspect the response structure for projectActivities
if (createRes.ok) {
  const projects = createRes.data.values ?? createRes.data;
  for (const p of projects) {
    console.log(`\nProject id=${p.id}, name="${p.name}", isInternal=${p.isInternal}`);
    console.log(`  projectActivities count: ${(p.projectActivities ?? []).length}`);
    for (const pa of (p.projectActivities ?? [])) {
      console.log(`  ProjectActivity id=${pa.id}`);
      console.log(`    pa.activity: ${JSON.stringify(pa.activity)}`);
      console.log(`    pa.startDate: ${pa.startDate}`);
    }
  }

  // Step 4: Verify with GET /activity for each project activity
  for (const p of projects) {
    for (const pa of (p.projectActivities ?? [])) {
      const actId = pa.activity?.id ?? pa.activityId;
      if (actId) {
        const actRes = await api("GET", `/activity/${actId}?fields=*`);
        console.log(`\nActivity ${actId} details:`, JSON.stringify(actRes.data, null, 2));
      }
    }
  }
}
