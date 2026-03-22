const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Verify the exact same flow: POST /department/list with 3 departments
const res = await fetch(`${BASE}/department/list`, {
  method: "POST",
  headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  body: JSON.stringify([
    { "name": "Logistikk Reflection fc039efb" },
    { "name": "Kundeservice Reflection fc039efb" },
    { "name": "HR Reflection fc039efb" }
  ]),
});

console.log("Status:", res.status);
const body = await res.json();
console.log(JSON.stringify(body, null, 2));

// Verify: confirm the departments exist via GET
const getRes = await fetch(`${BASE}/department?name=Reflection fc039efb&isInactive=false&fields=*`, {
  headers: { "Authorization": AUTH },
});
const getBody = await getRes.json();
console.log("\n--- GET verification ---");
console.log("Status:", getRes.status);
console.log("Count:", getBody.count);
for (const d of getBody.values || []) {
  console.log(`  id=${d.id} name="${d.name}" displayName="${d.displayName}" isInactive=${d.isInactive}`);
}
