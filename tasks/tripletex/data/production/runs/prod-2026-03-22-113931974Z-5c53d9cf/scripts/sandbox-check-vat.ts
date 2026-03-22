const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function main() {
  const res = await fetch(`${BASE}/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-22&fields=*`, {
    headers: { Authorization: AUTH },
  });
  const data = await res.json();
  console.log("OUTGOING VAT types:", res.status);
  for (const v of data.values) {
    console.log(`  id=${v.id} number="${v.number}" percentage=${v.percentage} name="${v.name}"`);
  }
}

main();
