// Sandbox verification: can we skip the GET /employee call?
// Test 1: POST /project/list without projectManager
// Test 2: POST /project/list with projectManager.id = 0 (the auth user)

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function tryPost(path: string, body: any, label: string) {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: H,
    body: JSON.stringify(body),
  });
  const text = await r.text();
  console.log(`[${label}] ${r.status}: ${text.substring(0, 500)}`);
  return { status: r.status, text };
}

// Test 1: without projectManager at all
const ts = Date.now();
await tryPost("/project/list", [{
  name: `SandboxTest-NoPM-${ts}`,
  startDate: "2026-01-01",
  isInternal: true,
  projectActivities: [{
    startDate: "2026-01-01",
    activity: { name: `SandboxTest-NoPM-${ts}`, activityType: "PROJECT_SPECIFIC_ACTIVITY", isChargeable: false }
  }]
}], "no-projectManager");

// Test 2: with projectManager.id = 0
await tryPost("/project/list", [{
  name: `SandboxTest-PM0-${ts}`,
  startDate: "2026-01-01",
  isInternal: true,
  projectManager: { id: 0 },
  projectActivities: [{
    startDate: "2026-01-01",
    activity: { name: `SandboxTest-PM0-${ts}`, activityType: "PROJECT_SPECIFIC_ACTIVITY", isChargeable: false }
  }]
}], "projectManager.id=0");

// Test 3: Can we get /token/session/whoAmI to get employee ID without GET /employee?
const whoAmI = await fetch(BASE + "/token/session/>whoAmI", { headers: H });
console.log(`[whoAmI] ${whoAmI.status}: ${(await whoAmI.text()).substring(0, 500)}`);

// Test 4: Check /token/session to get employee info
const session = await fetch(BASE + "/token/session", { headers: H });
console.log(`[session] ${session.status}: ${(await session.text()).substring(0, 500)}`);
