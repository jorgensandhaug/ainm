const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TAG = "Reflection 779e69a3";

const res = await fetch(`${BASE}/department/list`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify([
    { name: `Markedsføring ${TAG}` },
    { name: `Produksjon ${TAG}` },
    { name: `Innkjøp ${TAG}` },
  ]),
});

const body = await res.json();
console.log("Status:", res.status);
console.log("Response:", JSON.stringify(body, null, 2));

// Verify names match
if (res.status === 201 && body.values?.length === 3) {
  const names = body.values.map((v: any) => v.name);
  console.log("\nCreated names:", names);
  console.log("All names correct:",
    names[0] === `Markedsføring ${TAG}` &&
    names[1] === `Produksjon ${TAG}` &&
    names[2] === `Innkjøp ${TAG}`);
  console.log("Unicode ø preserved:", names[0].includes("ø"));
} else {
  console.log("UNEXPECTED RESULT");
}
