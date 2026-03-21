// Sandbox test: Can POST /employee?fields=employments(*) return startDate?
// Also test: Does the sandbox require department.id?
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

  // Test 1: POST /employee?fields=employments(*) — does it return startDate?
  console.log("=== Test 1: POST /employee?fields=employments(*) ===");
  const dept = await api("GET", "/department?isInactive=false&count=1&fields=id");
  const deptId = dept.data.values[0].id;
  const div = await api("GET", "/division?count=1&fields=id");
  const divId = div.data.values[0].id;

  const emp1 = await api("POST", `/employee?fields=employments(*)`, {
    firstName: `SandboxTest1_${ts}`,
    lastName: "ReflectionTest",
    dateOfBirth: "1997-06-24",
    email: `test1_${ts}@example.org`,
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [
      {
        startDate: "2026-10-15",
        division: { id: divId },
      },
    ],
  });

  // Check if employments in response has startDate
  if (emp1.status === 201) {
    const emps = emp1.data.value?.employments;
    console.log("\n=== Employment objects in POST response ===");
    console.log(JSON.stringify(emps, null, 2));
    if (emps && emps.length > 0 && emps[0].startDate) {
      console.log(`\n✅ POST response DOES include startDate: ${emps[0].startDate}`);
    } else {
      console.log(`\n❌ POST response does NOT include startDate in employments`);
    }
  }

  // Test 2: POST /employee?fields=* — does that help?
  console.log("\n=== Test 2: POST /employee?fields=* ===");
  const emp2 = await api("POST", `/employee?fields=*`, {
    firstName: `SandboxTest2_${ts}`,
    lastName: "ReflectionTest",
    dateOfBirth: "1997-06-24",
    email: `test2_${ts}@example.org`,
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [
      {
        startDate: "2026-10-15",
        division: { id: divId },
      },
    ],
  });

  if (emp2.status === 201) {
    const emps = emp2.data.value?.employments;
    console.log("\n=== Employment objects in POST ?fields=* response ===");
    console.log(JSON.stringify(emps, null, 2));
    if (emps && emps.length > 0 && emps[0].startDate) {
      console.log(`\n✅ POST ?fields=* response DOES include startDate: ${emps[0].startDate}`);
    } else {
      console.log(`\n❌ POST ?fields=* response does NOT include startDate in employments`);
    }
  }
}

run().catch(console.error);
