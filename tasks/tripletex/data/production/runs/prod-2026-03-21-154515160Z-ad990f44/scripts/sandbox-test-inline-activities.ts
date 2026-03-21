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
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) {
    console.error(JSON.stringify(json, null, 2));
  }
  return { status: r.status, ok: r.ok, data: json };
}

// Step 1: Get an assignable project manager
const empRes = await api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*");
if (!empRes.ok) { console.log("Cannot get employee, stopping."); process.exit(1); }
const managerId = empRes.data.values[0].id;
console.log(`Manager id: ${managerId}`);

// Step 2: Try POST /project/list with inline projectActivities
const ts = Date.now();
const projectsWithActivities = [
  {
    name: `InlineTest-A-${ts}`,
    startDate: "2026-01-01",
    isInternal: true,
    projectManager: { id: managerId },
    projectActivities: [
      {
        startDate: "2026-01-01",
        activity: {
          name: `InlineTest-A-${ts}`,
          activityType: "PROJECT_SPECIFIC_ACTIVITY",
          isChargeable: false,
        },
      },
    ],
  },
  {
    name: `InlineTest-B-${ts}`,
    startDate: "2026-01-01",
    isInternal: true,
    projectManager: { id: managerId },
    projectActivities: [
      {
        startDate: "2026-01-01",
        activity: {
          name: `InlineTest-B-${ts}`,
          activityType: "PROJECT_SPECIFIC_ACTIVITY",
          isChargeable: false,
        },
      },
    ],
  },
];

console.log("\n=== Testing POST /project/list with inline projectActivities ===");
const projRes = await api("POST", "/project/list", projectsWithActivities);

if (projRes.ok) {
  console.log("\nSUCCESS! Inline activities accepted.");
  const projects = projRes.data.values || projRes.data;
  for (const p of projects) {
    console.log(`  Project id=${p.id}, name=${p.name}`);
    if (p.projectActivities && p.projectActivities.length > 0) {
      for (const pa of p.projectActivities) {
        console.log(`    Activity: id=${pa.id}, activity=${JSON.stringify(pa.activity)}`);
      }
    } else {
      console.log(`    No projectActivities in response — need to check separately`);
    }
  }

  // Verify by fetching the projects with activities expanded
  const ids = projects.map((p: any) => p.id).join(",");
  const verifyRes = await api("GET", `/project?id=${ids}&fields=*,projectActivities(*)`);
  if (verifyRes.ok) {
    const vProjects = verifyRes.data.values || [];
    for (const vp of vProjects) {
      console.log(`\n  Verified project id=${vp.id}, name=${vp.name}`);
      if (vp.projectActivities && vp.projectActivities.length > 0) {
        for (const pa of vp.projectActivities) {
          console.log(`    Activity: id=${pa.id}, activity.name=${pa.activity?.name}, activity.id=${pa.activity?.id}`);
        }
      } else {
        console.log(`    NO activities found — inline create did NOT work`);
      }
    }
  }
} else {
  console.log("\nFAILED. Inline activities not accepted. Sticking with 6-call flow.");
}
