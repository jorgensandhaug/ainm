const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Verify batch create still works with the same 3 department names (suffixed to avoid collision)
const suffix = `Reflection ${Date.now()}`;
const res = await fetch(`${BASE}/department/list`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify([
    { name: `Produksjon ${suffix}` },
    { name: `Kvalitetskontroll ${suffix}` },
    { name: `HR ${suffix}` },
  ]),
});

const body = await res.json();
console.log("Status:", res.status);
console.log("Count:", body.count);
console.log("Values:", body.values?.map((v: any) => ({ id: v.id, name: v.name })));
console.log("fullResultSize:", body.fullResultSize);
