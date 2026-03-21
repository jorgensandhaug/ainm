const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/customer`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Floresta Reflection b3fb95fd Lda",
    organizationNumber: "999395956",
    email: "post-reflection-b3fb95fd@floresta.no",
    postalAddress: {
      addressLine1: "Kirkegata 132",
      postalCode: "7010",
      city: "Trondheim",
    },
  }),
});

const data = await res.json();
console.log("Status:", res.status);
console.log(JSON.stringify(data, null, 2));

// Verify key scored fields from response
if (res.status === 201) {
  const v = data.value;
  const checks = [
    ["name", v.name === "Floresta Reflection b3fb95fd Lda"],
    ["organizationNumber", v.organizationNumber === "999395956"],
    ["email", v.email === "post-reflection-b3fb95fd@floresta.no"],
    ["postalAddress.addressLine1", v.postalAddress?.addressLine1 === "Kirkegata 132"],
    ["postalAddress.postalCode", v.postalAddress?.postalCode === "7010"],
    ["postalAddress.city", v.postalAddress?.city === "Trondheim"],
  ];
  console.log("\n--- Field Checks ---");
  for (const [field, ok] of checks) {
    console.log(`${ok ? "PASS" : "FAIL"}: ${field}`);
  }
  console.log(`\nAll passed: ${checks.every(([, ok]) => ok)}`);
}
