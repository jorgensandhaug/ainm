// Test POST /employee/list for batch employee creation
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  // Get dept first
  const deptRes = await (await fetch(`${BASE}/department?isInactive=false&count=1&fields=id`, { headers: h })).json();
  const deptId = deptRes.values?.[0]?.id;
  console.log("Dept:", deptId);

  const ts = Date.now();
  const r = await fetch(`${BASE}/employee/list`, {
    method: "POST", headers: h,
    body: JSON.stringify([
      {
        firstName: "BatchTest1",
        lastName: `Refl${ts}`,
        email: `batchtest1.refl${ts}@example.org`,
        dateOfBirth: "1990-01-01",
        userType: "NO_ACCESS",
        ...(deptId ? { department: { id: deptId } } : {}),
      },
      {
        firstName: "BatchTest2",
        lastName: `Refl${ts}`,
        email: `batchtest2.refl${ts}@example.org`,
        dateOfBirth: "1992-06-15",
        userType: "NO_ACCESS",
        ...(deptId ? { department: { id: deptId } } : {}),
      },
    ]),
  });
  const j = await r.json();
  console.log("POST /employee/list:", r.status);
  if (r.ok) {
    console.log("Created employees:");
    for (const v of j.values || []) {
      console.log(`  id=${v.id} name=${v.firstName} ${v.lastName} email=${v.email}`);
    }
  } else {
    console.log("Error:", JSON.stringify(j));
  }
}
main();
