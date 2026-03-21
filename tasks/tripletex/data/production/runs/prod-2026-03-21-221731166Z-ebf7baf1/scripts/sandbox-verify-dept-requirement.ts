const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function post(url: string, body: any) {
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await r.json();
  return { status: r.status, json };
}

async function run() {
  // Test 1: POST without department — does sandbox require it?
  const ts = Date.now();
  const res1 = await post(`${BASE}/employee?fields=*,employments(*)`, {
    firstName: "SandboxTest" + ts,
    lastName: "NoDept",
    dateOfBirth: "1995-01-01",
    email: `nodept${ts}@test.org`,
    userType: "NO_ACCESS",
    employments: [{ startDate: "2026-08-01" }],
  });
  console.log("Test 1 (no dept):", res1.status);
  if (res1.status === 422) {
    const fields = (res1.json?.validationMessages || []).map((m: any) => m.field);
    console.log("  validation fields:", fields);
  }

  // Test 2: POST with department (get one first)
  const deptRes = await fetch(`${BASE}/department?isInactive=false&count=1&fields=id`, { headers: { Authorization: AUTH } });
  const deptJson = await deptRes.json();
  const deptId = deptJson.values?.[0]?.id;
  console.log("Dept ID:", deptId);

  if (deptId) {
    const res2 = await post(`${BASE}/employee?fields=*,employments(*)`, {
      firstName: "SandboxTest" + ts,
      lastName: "WithDept",
      dateOfBirth: "1995-02-02",
      email: `withdept${ts}@test.org`,
      userType: "NO_ACCESS",
      department: { id: deptId },
      employments: [{ startDate: "2026-08-01" }],
    });
    console.log("Test 2 (with dept):", res2.status);
    if (res2.status === 201) {
      const v = res2.json.value;
      console.log("  employee:", v.id, v.firstName, v.lastName);
      console.log("  dob:", v.dateOfBirth, "email:", v.email);
      console.log("  employment startDate:", v.employments?.[0]?.startDate);
    }
  }
}

run();
