const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

const r = await fetch(`${BASE}/product?count=100&fields=id,number,name`, { headers: h });
const json = await r.json();
console.log("Products in sandbox:");
for (const p of json.values) {
  console.log(`  id=${p.id} number=${p.number} name=${p.name}`);
}
