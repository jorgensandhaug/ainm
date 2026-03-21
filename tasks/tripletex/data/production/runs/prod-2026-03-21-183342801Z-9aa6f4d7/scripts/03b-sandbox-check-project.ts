const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const HEADERS = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  const r = await fetch(`${BASE}/project?name=${encodeURIComponent("Skymigrering Reflection 9aa6f4d7")}&count=50&fields=*,customer(*),projectManager(*)`, { headers: HEADERS });
  const data = await r.json();
  console.log(JSON.stringify(data, null, 2));
}
main();
