const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Sandbox verification: same shape as production run (French-language prompt, Norwegian customer)
const res = await fetch(`${BASE}/customer`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Montagne Reflection 849e049c SARL",
    organizationNumber: "999849049",
    email: "post-reflection-849e049c@montagne.no",
    postalAddress: {
      addressLine1: "Kirkegata 19",
      postalCode: "4611",
      city: "Kristiansand",
    },
  }),
});

const data = await res.json();
console.log("Status:", res.status);
console.log(JSON.stringify(data, null, 2));

// Verify scored fields directly from response
if (res.status === 201) {
  const v = data.value;
  const checks = [
    ["name", v.name === "Montagne Reflection 849e049c SARL"],
    ["orgNumber", v.organizationNumber === "999849049"],
    ["email", v.email === "post-reflection-849e049c@montagne.no"],
    ["postalAddress.addressLine1", v.postalAddress?.addressLine1 === "Kirkegata 19"],
    ["postalAddress.postalCode", v.postalAddress?.postalCode === "4611"],
    ["postalAddress.city", v.postalAddress?.city === "Kristiansand"],
  ];
  console.log("\nField checks:");
  for (const [field, ok] of checks) {
    console.log(`  ${ok ? "PASS" : "FAIL"}: ${field}`);
  }
  console.log(`\nAll passed: ${checks.every(([, ok]) => ok)}`);
}
