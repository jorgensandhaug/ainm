const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const HEADERS = { Authorization: AUTH, "Content-Type": "application/json" };

async function run() {
  // Step 1: Get a valid department
  const deptRes = await fetch(`${BASE}/department?isInactive=false&count=1&fields=id`, { headers: HEADERS });
  const deptData = await deptRes.json();
  console.log("Departments:", JSON.stringify(deptData));

  let deptId: number;
  if (deptData.count > 0) {
    deptId = deptData.values[0].id;
  } else {
    // Create one
    const createRes = await fetch(`${BASE}/department`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ name: "TestDept" }),
    });
    const createData = await createRes.json();
    console.log("Created dept:", JSON.stringify(createData));
    deptId = createData.value.id;
  }
  console.log("Using dept id:", deptId);

  // Test A: department inside employment → should fail with code 16000
  console.log("\n=== TEST A: department inside employment (expect code 16000) ===");
  const resA = await fetch(`${BASE}/employee?fields=*,employments(*)`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      firstName: "TestA",
      lastName: "DeptInEmp",
      dateOfBirth: "1990-01-01",
      email: "testa.deptinemp@example.org",
      userType: "NO_ACCESS",
      department: { id: deptId },
      employments: [{ startDate: "2026-01-01", department: { id: deptId } }],
    }),
  });
  const dataA = await resA.json();
  console.log("Status:", resA.status, "Code:", dataA.code);
  console.log("Validation:", JSON.stringify(dataA.validationMessages));

  // Test B: department at top level only → should succeed
  console.log("\n=== TEST B: department at top level only (expect 201) ===");
  const resB = await fetch(`${BASE}/employee?fields=*,employments(*)`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      firstName: "TestB",
      lastName: "DeptTopLevel",
      dateOfBirth: "1990-01-02",
      email: "testb.depttoplevel@example.org",
      userType: "NO_ACCESS",
      department: { id: deptId },
      employments: [{ startDate: "2026-01-01" }],
    }),
  });
  const dataB = await resB.json();
  console.log("Status:", resB.status);
  if (resB.status === 201) {
    console.log("Employee ID:", dataB.value.id);
    console.log("Department:", JSON.stringify(dataB.value.department));
    console.log("StartDate:", dataB.value.employments[0]?.startDate);
    console.log("SUCCESS — correct payload works");
  } else {
    console.log("Body:", JSON.stringify(dataB, null, 2));
  }

  // Test C: department only inside employment, not top level → should fail
  console.log("\n=== TEST C: department only in employment (expect code 16000) ===");
  const resC = await fetch(`${BASE}/employee?fields=*,employments(*)`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      firstName: "TestC",
      lastName: "DeptOnlyInEmp",
      dateOfBirth: "1990-01-03",
      email: "testc.deptonlyinemp@example.org",
      userType: "NO_ACCESS",
      employments: [{ startDate: "2026-01-01", department: { id: deptId } }],
    }),
  });
  const dataC = await resC.json();
  console.log("Status:", resC.status, "Code:", dataC.code);
  console.log("Validation:", JSON.stringify(dataC.validationMessages));
}

run().catch(console.error);
