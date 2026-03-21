const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  const r = await fetch(`${BASE}/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=id,name,number,percentage`, { headers: h });
  const j = await r.json();
  console.log("Status:", r.status);
  console.log("Count:", j.values?.length);
  // Show all
  for (const v of j.values || []) {
    console.log(`  id=${v.id} number=${v.number} pct=${v.percentage} name=${v.name}`);
  }
}
main();
