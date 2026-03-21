// Sandbox investigation: test which fields are valid on employment object
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";
const h = { "Content-Type": "application/json", Authorization: AUTH };
const uid = Math.floor(Math.random() * 100000);

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  console.log("GET", path, r.status);
  return { status: r.status, body: b };
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  console.log("POST", path, r.status);
  return { status: r.status, body: b };
}

async function main() {
  // Get dept and div
  const [deptRes, divRes] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=*"),
    get("/division?count=1&fields=*"),
  ]);
  const deptId = deptRes.body.values?.[0]?.id;
  const divId = divRes.body.values?.[0]?.id;
  console.log("dept:", deptId, "div:", divId);

  // Test 1: Employee with employmentType (should fail in production, let's see sandbox)
  console.log("\n--- Test 1: Employee WITH employmentType ---");
  const res1 = await post("/employee", {
    firstName: `Test${uid}`,
    lastName: "WithType",
    email: `test${uid}a@example.org`,
    dateOfBirth: "1985-01-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{
      startDate: TODAY,
      employmentType: "ORDINARY",
      percentageOfFullTimeEquivalent: 100,
      ...(divId ? { division: { id: divId } } : {}),
    }],
  });
  if (res1.status !== 201) {
    console.log("Failed:", JSON.stringify(res1.body.validationMessages));
  } else {
    console.log("Succeeded, id:", res1.body.value.id);
  }

  // Test 2: Employee WITHOUT employmentType (should work)
  console.log("\n--- Test 2: Employee WITHOUT employmentType ---");
  const res2 = await post("/employee", {
    firstName: `Test${uid}`,
    lastName: "NoType",
    email: `test${uid}b@example.org`,
    dateOfBirth: "1985-01-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{
      startDate: TODAY,
      ...(divId ? { division: { id: divId } } : {}),
    }],
  });
  if (res2.status !== 201) {
    console.log("Failed:", JSON.stringify(res2.body.validationMessages));
  } else {
    console.log("Succeeded, id:", res2.body.value.id);
  }
}

main().catch((e) => console.error("FATAL:", e.message));
