const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Verify the same batch create shape in sandbox with tagged names
const departments = [
  { name: "Produksjon Reflection 20260321-173420" },
  { name: "Lager Reflection 20260321-173420" },
  { name: "Kvalitetskontroll Reflection 20260321-173420" },
];

const res = await fetch(`${BASE}/department/list`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: AUTH,
  },
  body: JSON.stringify(departments),
});

const body = await res.json();
console.log("Status:", res.status);
console.log("Response:", JSON.stringify(body, null, 2));

if (res.status === 201) {
  console.log("\nSandbox verification passed: batch create still works with 1 call");
  for (const dept of body.values) {
    console.log(`  id=${dept.id} name="${dept.name}" displayName="${dept.displayName}" isInactive=${dept.isInactive}`);
  }
} else {
  console.error("Unexpected status:", res.status);
}
