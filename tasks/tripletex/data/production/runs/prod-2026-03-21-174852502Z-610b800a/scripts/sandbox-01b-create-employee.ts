const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const suffix = Math.floor(Math.random() * 1000000);
const email = `sandbox-divtest-${suffix}@example.org`;

const res = await fetch(`${BASE}/employee`, {
  method: "POST",
  headers: { Authorization: AUTH, "Content-Type": "application/json" },
  body: JSON.stringify({
    firstName: "SandboxDiv",
    lastName: `Test${suffix}`,
    email,
    dateOfBirth: null,
  }),
});
const text = await res.text();
console.log("Status:", res.status);
console.log("Body:", text);
console.log("email:", email);
