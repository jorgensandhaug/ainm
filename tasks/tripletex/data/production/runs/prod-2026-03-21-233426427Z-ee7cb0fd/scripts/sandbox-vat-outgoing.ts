const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };
const res = await fetch(`${BASE}/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-22&fields=*`, { headers: H });
const data = await res.json();
console.log(JSON.stringify(data.values, null, 2));
