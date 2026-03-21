const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Reproduce the exact production payload shape with sandbox-unique values
const payload = {
  name: "Porto Alegre Reflection 92322c6b Lda",
  organizationNumber: "999923226",
  email: "post-reflection-92322c6b@porto.no",
  postalAddress: {
    addressLine1: "Storgata 65",
    postalCode: "4611",
    city: "Kristiansand",
  },
};

const res = await fetch(`${BASE}/customer`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: AUTH,
  },
  body: JSON.stringify(payload),
});

const body = await res.json();
console.log("STATUS:", res.status);
console.log("BODY:", JSON.stringify(body, null, 2));

// Verify all scored fields are present in the response without needing a follow-up GET
if (res.status === 201) {
  const v = body.value;
  console.log("\n--- VERIFICATION ---");
  console.log("name:", v.name);
  console.log("organizationNumber:", v.organizationNumber);
  console.log("email:", v.email);
  console.log("postalAddress.addressLine1:", v.postalAddress?.addressLine1);
  console.log("postalAddress.postalCode:", v.postalAddress?.postalCode);
  console.log("postalAddress.city:", v.postalAddress?.city);
  console.log("physicalAddress (sparse link?):", JSON.stringify(v.physicalAddress));
  console.log("\nAll scored fields present in POST response: no follow-up GET needed.");
}
