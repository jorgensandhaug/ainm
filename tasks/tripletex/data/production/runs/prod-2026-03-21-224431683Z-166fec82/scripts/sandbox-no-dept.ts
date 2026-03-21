const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  // Try creating employee WITHOUT department
  const r = await fetch(`${BASE}/employee`, {
    method: "POST", headers: h,
    body: JSON.stringify({
      firstName: "TestNoDept",
      lastName: "Reflection",
      email: "testnodept.reflection@example.org",
      dateOfBirth: "1990-01-01",
      userType: "NO_ACCESS",
    }),
  });
  const j = await r.json();
  console.log("POST /employee (no dept):", r.status);
  if (!r.ok) {
    console.log("Error:", JSON.stringify(j));
  } else {
    console.log("Success! id=", j.value?.id, "dept=", JSON.stringify(j.value?.department));
  }
}
main();
