const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/department/list`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify([
    { name: "Logistikk Reflection 20260321-171405" },
    { name: "Salg Reflection 20260321-171405" },
    { name: "Drift Reflection 20260321-171405" },
  ]),
});

console.log("Status:", res.status);
const body = await res.json();
console.log(JSON.stringify(body, null, 2));
