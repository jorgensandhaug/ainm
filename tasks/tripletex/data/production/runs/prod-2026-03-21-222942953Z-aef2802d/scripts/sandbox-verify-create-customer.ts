const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Create a sandbox customer mirroring the production German-language task shape
const uid = crypto.randomUUID().slice(0, 8);
const res = await fetch(`${BASE}/customer`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: `Bergwerk Reflection ${uid} GmbH`,
    organizationNumber: "999" + uid.replace(/[^0-9]/g, "").slice(0, 6).padEnd(6, "0"),
    email: `post-reflection-${uid}@bergwerk.no`,
    postalAddress: {
      addressLine1: "Solveien 5",
      postalCode: "3015",
      city: "Drammen",
    },
  }),
});

const data = await res.json();
console.log("Status:", res.status);
const v = data.value;
console.log("id:", v.id);
console.log("name:", v.name);
console.log("orgNr:", v.organizationNumber);
console.log("email:", v.email);
console.log("addr:", v.postalAddress?.addressLine1, v.postalAddress?.postalCode, v.postalAddress?.city);
console.log("physicalAddress sparse?", v.physicalAddress && !v.physicalAddress.addressLine1 ? "yes (link only)" : "no");
