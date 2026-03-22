const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const HEADERS = { Authorization: AUTH, "Content-Type": "application/json" };

async function run() {
  // Get dept
  const deptRes = await fetch(`${BASE}/department?isInactive=false&count=1&fields=id`, { headers: HEADERS });
  const deptData = await deptRes.json();
  const deptId = deptData.values[0].id;
  console.log("Dept id:", deptId);

  // Get division (sandbox needs it)
  const divRes = await fetch(`${BASE}/division?count=1&fields=id`, { headers: HEADERS });
  const divData = await divRes.json();
  const divId = divData.values[0].id;
  console.log("Div id:", divId);

  // Full correct flow with dept at top level + division in employment
  console.log("\n=== Correct full sandbox flow ===");
  const res = await fetch(`${BASE}/employee?fields=*,employments(*)`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      firstName: "TestFull",
      lastName: "CorrectFlow",
      dateOfBirth: "1990-06-15",
      email: "testfull.correctflow@example.org",
      userType: "NO_ACCESS",
      department: { id: deptId },
      employments: [{ startDate: "2026-03-01", division: { id: divId } }],
    }),
  });
  const data = await res.json();
  console.log("Status:", res.status);
  if (res.status === 201) {
    console.log("Employee ID:", data.value.id);
    console.log("Name:", data.value.firstName, data.value.lastName);
    console.log("DOB:", data.value.dateOfBirth);
    console.log("Email:", data.value.email);
    console.log("Department:", JSON.stringify(data.value.department));
    console.log("Employment startDate:", data.value.employments[0]?.startDate);
    console.log("Employment division:", JSON.stringify(data.value.employments[0]?.division));
    console.log("SUCCESS");
  } else {
    console.log("Body:", JSON.stringify(data, null, 2));
  }
}

run().catch(console.error);
