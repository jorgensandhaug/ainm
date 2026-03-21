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
  if (!r.ok) console.log(JSON.stringify(j, null, 2));
  return { status: r.status, data: j };
}

async function run() {
  // Step 1: Pre-read department (just need the id)
  const deptRes = await api("GET", "/department?isInactive=false&count=1&fields=id");
  console.log("Department count:", deptRes.data.count);

  let deptId: number | undefined;
  if (deptRes.data.count > 0) {
    deptId = deptRes.data.values[0].id;
    console.log("Department ID:", deptId);
  }

  // Step 2: POST employee with department pre-included
  const payload: any = {
    firstName: "Test",
    lastName: "PreReadDept",
    dateOfBirth: "1990-05-15",
    email: "test.preread@example.org",
    userType: "NO_ACCESS",
    employments: [{ startDate: "2026-08-01" }],
  };

  if (deptId) {
    payload.department = { id: deptId };
  }

  const res = await api("POST", "/employee?fields=*,employments(*)", payload);

  if (res.status === 201) {
    const v = res.data.value;
    console.log("\nSuccess! 2 calls, 0 errors");
    console.log("Employee ID:", v.id);
    console.log("Name:", v.firstName, v.lastName);
    console.log("DOB:", v.dateOfBirth);
    console.log("Email:", v.email);
    console.log("Dept:", JSON.stringify(v.department));
    console.log("Start date:", v.employments?.[0]?.startDate);
  } else {
    console.log("FAILED - unexpected status", res.status);
  }
}

run();
