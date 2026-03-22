const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Sandbox verification: create customer with same shape as production run
const res = await fetch(`${BASE}/customer`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Windmill Reflection de7f6ef9 Ltd",
    organizationNumber: "999767609",
    email: "post-reflection-de7f6ef9@windmill.no",
    postalAddress: {
      addressLine1: "Parkveien 124",
      postalCode: "7010",
      city: "Trondheim",
    },
  }),
});

const data = await res.json();
console.log("Status:", res.status);
console.log(JSON.stringify(data, null, 2));

// Verify all scored fields
const v = data.value;
const checks = [
  { field: "name", expected: "Windmill Reflection de7f6ef9 Ltd", actual: v.name },
  { field: "organizationNumber", expected: "999767609", actual: v.organizationNumber },
  { field: "email", expected: "post-reflection-de7f6ef9@windmill.no", actual: v.email },
  { field: "postalAddress.addressLine1", expected: "Parkveien 124", actual: v.postalAddress?.addressLine1 },
  { field: "postalAddress.postalCode", expected: "7010", actual: v.postalAddress?.postalCode },
  { field: "postalAddress.city", expected: "Trondheim", actual: v.postalAddress?.city },
];

console.log("\n--- Field Verification ---");
let allPass = true;
for (const c of checks) {
  const pass = c.actual === c.expected;
  if (!pass) allPass = false;
  console.log(`${pass ? "PASS" : "FAIL"}: ${c.field} = ${JSON.stringify(c.actual)} (expected ${JSON.stringify(c.expected)})`);
}
console.log(allPass ? "\nAll checks passed." : "\nSome checks FAILED.");
