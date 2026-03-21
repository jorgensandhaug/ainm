const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const j = await r.json();
  console.log(`${method} ${path} → ${r.status}`);
  return { status: r.status, data: j };
}

async function run() {
  // Strategy B: pre-read department only, division repair if needed
  console.log("=== Strategy B: Pre-read department only ===");
  const deptRes = await api("GET", "/department?isInactive=false&count=1&fields=id");
  const deptId = deptRes.data.values?.[0]?.id;
  console.log("Dept ID:", deptId);

  const payload: any = {
    firstName: "TestB",
    lastName: "DeptOnly",
    dateOfBirth: "1990-05-15",
    email: "testb.deptonly@example.org",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{ startDate: "2026-08-01" }],
  };

  let res = await api("POST", "/employee?fields=*,employments(*)", payload);
  if (res.status === 422) {
    const msgs = res.data.validationMessages || [];
    const needsDiv = msgs.some((m: any) => m.field === "employments.division.id");
    if (needsDiv) {
      console.log("Division needed — repair branch");
      const divRes = await api("GET", "/division?count=1&fields=id");
      const divId = divRes.data.values?.[0]?.id;
      console.log("Division ID:", divId);
      payload.employments = [{ startDate: "2026-08-01", division: { id: divId } }];
      res = await api("POST", "/employee?fields=*,employments(*)", payload);
    }
  }
  if (res.status === 201) {
    console.log("Strategy B success:", res.data.value.id);
    console.log("Total: dept-only pre-read + division repair = 4 calls, 1 error (sandbox)");
    console.log("In production (no division needed): would be 2 calls, 0 errors");
  }

  // Strategy C: pre-read both department and division in parallel
  console.log("\n=== Strategy C: Pre-read both dept + div (parallel) ===");
  const [dept2, div2] = await Promise.all([
    api("GET", "/department?isInactive=false&count=1&fields=id"),
    api("GET", "/division?count=1&fields=id"),
  ]);
  const deptId2 = dept2.data.values?.[0]?.id;
  const divId2 = div2.data.values?.[0]?.id;
  console.log("Dept ID:", deptId2, "Div ID:", divId2);

  const payload2: any = {
    firstName: "TestC",
    lastName: "BothPreRead",
    dateOfBirth: "1991-06-20",
    email: "testc.both@example.org",
    userType: "NO_ACCESS",
    department: { id: deptId2 },
    employments: [{ startDate: "2026-09-01", division: { id: divId2 } }],
  };

  const res2 = await api("POST", "/employee?fields=*,employments(*)", payload2);
  if (res2.status === 201) {
    console.log("Strategy C success:", res2.data.value.id);
    console.log("Total: 3 calls (2 parallel GETs + 1 POST), 0 errors always");
  }
}

run();
