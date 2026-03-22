const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Verify the exact same batch create shape used in production
const res = await fetch(`${BASE}/department/list`, {
  method: "POST",
  headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  body: JSON.stringify([
    { name: "HR Reflection 20260322" },
    { name: "Salg Reflection 20260322" },
    { name: "Økonomi Reflection 20260322" }
  ])
});

console.log("STATUS:", res.status);
const body = await res.json();
console.log("RESPONSE:", JSON.stringify(body, null, 2));

// Verify names are exact
if (res.status === 201 && body.values) {
  const names = body.values.map((v: any) => v.name);
  console.log("\nCreated names:", names);
  console.log("All names correct:",
    names[0] === "HR Reflection 20260322" &&
    names[1] === "Salg Reflection 20260322" &&
    names[2] === "Økonomi Reflection 20260322"
  );
}
