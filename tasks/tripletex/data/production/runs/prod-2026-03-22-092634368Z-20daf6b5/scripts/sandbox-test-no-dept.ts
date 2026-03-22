// Test: Can POST /employee work WITHOUT department on the persistent sandbox?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// Test 1: POST /employee WITHOUT department
console.log("=== Test 1: POST /employee WITHOUT department ===");
const res1 = await fetch(`${BASE}/employee?fields=*,employments(*)`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    firstName: "TestNoDept",
    lastName: "Sandbox",
    dateOfBirth: "1990-01-01",
    email: "testnodept@example.org",
    userType: "NO_ACCESS",
    employments: [{ startDate: "2026-08-01" }],
  }),
});
const data1 = await res1.json();
console.log("Status:", res1.status);
if (res1.status === 201) {
  console.log("SUCCESS without department! Employee id:", data1.value.id);
  console.log("department:", JSON.stringify(data1.value.department));
} else {
  console.log("Response:", JSON.stringify(data1, null, 2));
}
