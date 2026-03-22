const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const HEADERS = { Authorization: AUTH, "Content-Type": "application/json" };

async function run() {
  // Test 1: Verify that putting department inside employment causes code 16000
  console.log("=== TEST 1: department inside employment (should fail with 16000) ===");
  const badPayload = {
    firstName: "Test",
    lastName: "DeptInEmployment",
    dateOfBirth: "1990-01-01",
    email: "test.deptinemployment@example.org",
    userType: "NO_ACCESS",
    department: { id: 973047 },
    employments: [
      {
        startDate: "2026-01-01",
        department: { id: 973047 },
      },
    ],
  };
  const res1 = await fetch(`${BASE}/employee?fields=*,employments(*)`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(badPayload),
  });
  const data1 = await res1.json();
  console.log("Status:", res1.status);
  console.log("Code:", data1.code);
  console.log("Message:", data1.message);
  console.log("Validation:", JSON.stringify(data1.validationMessages, null, 2));

  // Test 2: Verify correct payload (department at top level only)
  console.log("\n=== TEST 2: department at top level only (should succeed) ===");
  const goodPayload = {
    firstName: "Test",
    lastName: "DeptTopLevel",
    dateOfBirth: "1990-01-02",
    email: "test.depttoplevel@example.org",
    userType: "NO_ACCESS",
    department: { id: 973047 },
    employments: [
      {
        startDate: "2026-01-01",
      },
    ],
  };
  const res2 = await fetch(`${BASE}/employee?fields=*,employments(*)`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(goodPayload),
  });
  const data2 = await res2.json();
  console.log("Status:", res2.status);
  if (res2.status === 201) {
    console.log("Employee ID:", data2.value.id);
    console.log("Department:", JSON.stringify(data2.value.department));
    console.log("Employment startDate:", data2.value.employments[0]?.startDate);
  } else {
    console.log("Body:", JSON.stringify(data2, null, 2));
  }

  // Test 3: Verify that department ONLY inside employment (not at top level) also fails
  console.log("\n=== TEST 3: department only inside employment, not at top level (should fail) ===");
  const badPayload2 = {
    firstName: "Test",
    lastName: "DeptOnlyInEmp",
    dateOfBirth: "1990-01-03",
    email: "test.deptonlyinemp@example.org",
    userType: "NO_ACCESS",
    employments: [
      {
        startDate: "2026-01-01",
        department: { id: 973047 },
      },
    ],
  };
  const res3 = await fetch(`${BASE}/employee?fields=*,employments(*)`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(badPayload2),
  });
  const data3 = await res3.json();
  console.log("Status:", res3.status);
  console.log("Code:", data3.code);
  console.log("Message:", data3.message);
  console.log("Validation:", JSON.stringify(data3.validationMessages, null, 2));
}

run().catch(console.error);
