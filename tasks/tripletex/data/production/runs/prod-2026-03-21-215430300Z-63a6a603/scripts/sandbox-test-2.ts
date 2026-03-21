// Sandbox test: POST /employee?fields=*,employments(*) — does it return both employee fields AND startDate?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const headers = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`\n${method} ${url}`);
  const opts: any = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`Status: ${res.status}`);
  const data = text ? JSON.parse(text) : null;
  console.log(JSON.stringify(data, null, 2));
  return { status: res.status, data };
}

async function run() {
  const ts = Date.now();

  // Test: POST /employee?fields=*,employments(*)
  console.log("=== Test: POST /employee?fields=*,employments(*) ===");
  const result = await api("POST", `/employee?fields=*,employments(*)`, {
    firstName: `SandboxTest3_${ts}`,
    lastName: "ReflectionTest",
    dateOfBirth: "1997-06-24",
    email: `test3_${ts}@example.org`,
    userType: "NO_ACCESS",
    department: { id: 837842 },
    employments: [
      {
        startDate: "2026-10-15",
        division: { id: 108244566 },
      },
    ],
  });

  if (result.status === 201) {
    const val = result.data.value;
    console.log("\n=== Key fields check ===");
    console.log(`value.id: ${val?.id}`);
    console.log(`value.firstName: ${val?.firstName}`);
    console.log(`value.lastName: ${val?.lastName}`);
    console.log(`value.dateOfBirth: ${val?.dateOfBirth}`);
    console.log(`value.email: ${val?.email}`);
    console.log(`value.employments[0].startDate: ${val?.employments?.[0]?.startDate}`);
    console.log(`value.employments[0].id: ${val?.employments?.[0]?.id}`);
  }
}

run().catch(console.error);
