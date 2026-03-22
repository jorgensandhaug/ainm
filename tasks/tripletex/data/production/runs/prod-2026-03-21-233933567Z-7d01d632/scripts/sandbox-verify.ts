const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/customer`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Greenfield Reflection 7d01d632 Ltd",
    organizationNumber: "999701632",
    email: "post-reflection-7d01d632@greenfield.no",
    postalAddress: {
      addressLine1: "Sjøgata 85",
      postalCode: "7010",
      city: "Trondheim",
    },
  }),
});

const data = await res.json();
console.log("Status:", res.status);
console.log("Response:", JSON.stringify(data, null, 2));

// Verify scored fields from response
const v = data.value;
console.log("\n--- Scored Field Verification ---");
console.log("name:", v.name);
console.log("organizationNumber:", v.organizationNumber);
console.log("email:", v.email);
console.log("postalAddress.addressLine1:", v.postalAddress?.addressLine1);
console.log("postalAddress.postalCode:", v.postalAddress?.postalCode);
console.log("postalAddress.city:", v.postalAddress?.city);
console.log("physicalAddress (sparse link only):", v.physicalAddress?.id ? "yes" : "no");
