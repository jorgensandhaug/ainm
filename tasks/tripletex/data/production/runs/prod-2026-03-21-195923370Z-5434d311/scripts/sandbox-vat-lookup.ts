const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

const res = await fetch(`${BASE}/ledger/vatType?count=100`, { headers });
const data = await res.json();
for (const v of (data.values || [])) {
  console.log(`id=${v.id} pct=${v.percentage} name=${v.name} number=${v.number}`);
}
