const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Create a disposable underconfigured employee to test the division-create branch
const suffix = Math.floor(Math.random() * 1000000);
const email = `sandbox-divtest-${suffix}@example.org`;

const res = await fetch(`${BASE}/employee`, {
  method: "POST",
  headers: { Authorization: AUTH, "Content-Type": "application/json" },
  body: JSON.stringify({
    firstName: "SandboxDiv",
    lastName: `Test${suffix}`,
    email,
  }),
});
const data = await res.json();
console.log("POST employee status:", res.status);
console.log("Employee id:", data.value?.id);
console.log("dateOfBirth:", data.value?.dateOfBirth);
console.log("employments:", JSON.stringify(data.value?.employments));
console.log("email:", email);
