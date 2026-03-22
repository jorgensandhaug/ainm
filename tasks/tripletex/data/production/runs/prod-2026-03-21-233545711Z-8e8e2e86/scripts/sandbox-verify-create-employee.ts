// Sandbox verification: confirm pre-read strategy still works
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: GET department
const deptRes = await fetch(`${BASE}/department?isInactive=false&count=1&fields=id`, { headers: H });
const deptData = await deptRes.json();
console.log("GET /department status:", deptRes.status, "count:", deptData.count);
const deptId = deptData.values?.[0]?.id;
console.log("Department id:", deptId);

// Step 2: POST employee with dept + nested employment
const payload = {
  firstName: "TestReflection",
  lastName: "Sandbox",
  dateOfBirth: "1990-01-15",
  email: "test.reflection.sandbox@example.org",
  userType: "NO_ACCESS",
  department: { id: deptId },
  employments: [{ startDate: "2026-08-01" }],
};

const empRes = await fetch(`${BASE}/employee?fields=*,employments(*)`, {
  method: "POST",
  headers: H,
  body: JSON.stringify(payload),
});
const empData = await empRes.json();
console.log("POST /employee status:", empRes.status);

if (empRes.ok) {
  console.log("SUCCESS — employee created:");
  console.log("  id:", empData.value.id);
  console.log("  firstName:", empData.value.firstName);
  console.log("  lastName:", empData.value.lastName);
  console.log("  dateOfBirth:", empData.value.dateOfBirth);
  console.log("  email:", empData.value.email);
  console.log("  employments:", JSON.stringify(empData.value.employments?.map((e: any) => ({
    id: e.id, startDate: e.startDate
  }))));
} else {
  console.log("FAILED:", JSON.stringify(empData));
  // If division needed, verify the repair branch
  const msgs = empData.validationMessages || [];
  const needsDiv = msgs.some((m: any) => m.field === "employments.division.id");
  if (needsDiv) {
    console.log("Division required in sandbox (as expected).");
    const divRes = await fetch(`${BASE}/division?count=1&fields=id`, { headers: H });
    const divData = await divRes.json();
    console.log("GET /division status:", divRes.status, "id:", divData.values?.[0]?.id);

    payload.employments[0] = { startDate: "2026-08-01", division: { id: divData.values[0].id } } as any;
    const retryRes = await fetch(`${BASE}/employee?fields=*,employments(*)`, {
      method: "POST",
      headers: H,
      body: JSON.stringify(payload),
    });
    const retryData = await retryRes.json();
    console.log("POST /employee retry status:", retryRes.status);
    if (retryRes.ok) {
      console.log("SUCCESS after division repair:");
      console.log("  id:", retryData.value.id);
      console.log("  startDate:", retryData.value.employments?.[0]?.startDate);
    } else {
      console.log("Retry also failed:", JSON.stringify(retryData));
    }
  }
}
