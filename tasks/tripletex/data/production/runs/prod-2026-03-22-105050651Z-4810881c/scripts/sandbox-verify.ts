// Sandbox verification: confirm the 3-call flow still works
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers });
  if (!r.ok) { console.error(`GET ${path} → ${r.status}`, await r.text()); return null; }
  return r.json();
}

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await r.text();
  console.log(`POST ${path} → ${r.status}`);
  if (!r.ok) { console.error(text); return null; }
  return JSON.parse(text);
}

// Test 1: Verify ledger posting query works with fields=*,account(*)
const postingsRes = await get("/ledger/posting?dateFrom=2026-01-01&dateTo=2026-03-01&count=10000&fields=*,account(*)");
if (postingsRes) {
  console.log(`Postings count: ${postingsRes.values?.length || 0}`);
  if (postingsRes.values?.length > 0) {
    const sample = postingsRes.values[0];
    console.log(`Sample posting: date=${sample.date}, amount=${sample.amount}, account.number=${sample.account?.number}, account.displayName=${sample.account?.displayName}, account.type=${sample.account?.type}`);
  }
}

// Test 2: Verify employee assignable managers query
const empRes = await get("/employee?assignableProjectManagers=true&count=1&fields=*");
if (empRes) {
  const mgr = empRes.values?.[0];
  console.log(`Manager: id=${mgr?.id}, name=${mgr?.firstName} ${mgr?.lastName}`);
}

// Test 3: Verify POST /project/list with inline activities still works
if (empRes?.values?.[0]?.id) {
  const mgrId = empRes.values[0].id;
  const ts = Date.now();
  const testPayload = [{
    name: `SandboxVerify-${ts}`,
    startDate: "2026-01-01",
    isInternal: true,
    projectManager: { id: mgrId },
    projectActivities: [{
      startDate: "2026-01-01",
      activity: {
        name: `SandboxVerify-${ts}`,
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: false,
      },
    }],
  }];
  const createRes = await post("/project/list", testPayload);
  if (createRes) {
    const p = createRes.values?.[0] || createRes[0];
    console.log(`Created project: id=${p?.id}, name=${p?.name}, isInternal=${p?.isInternal}, manager=${p?.projectManager?.id}`);
    if (p?.projectActivities) {
      for (const pa of p.projectActivities) {
        console.log(`  Activity: id=${pa.id}`);
      }
    }
    // Verify with GET
    const verifyRes = await get(`/project/${p?.id}?fields=*,projectActivities(*,activity(*)),projectManager(id,firstName,lastName)`);
    if (verifyRes) {
      const v = verifyRes.value;
      console.log(`Verified project: id=${v?.id}, name="${v?.name}", isInternal=${v?.isInternal}`);
      if (v?.projectActivities) {
        for (const pa of v.projectActivities) {
          console.log(`  Verified activity: id=${pa.id}, name="${pa.activity?.name}", activityType=${pa.activity?.activityType}, isChargeable=${pa.activity?.isChargeable}`);
        }
      }
    }
  }
}

console.log("\nSandbox verification complete.");
