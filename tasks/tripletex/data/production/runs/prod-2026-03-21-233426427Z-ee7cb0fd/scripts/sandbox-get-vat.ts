const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };
const res = await fetch(`${BASE}/ledger/vatType?count=10&fields=id,number,name,percentage`, { headers: H });
const data = await res.json();
console.log(JSON.stringify(data.values?.slice(0, 10), null, 2));
