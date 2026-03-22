const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/customer`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Skogheim Reflection 4997b67e AS",
    organizationNumber: "999497676",
    email: "post-reflection-4997b67e@skogheim.no",
    postalAddress: {
      addressLine1: "Parkveien 17",
      postalCode: "4611",
      city: "Kristiansand",
    },
  }),
});

const data = await res.json();
console.log("STATUS:", res.status);
console.log(JSON.stringify(data, null, 2));

// Verify scored fields
const v = data.value;
const checks = [
  ["name", v.name === "Skogheim Reflection 4997b67e AS"],
  ["organizationNumber", v.organizationNumber === "999497676"],
  ["email", v.email === "post-reflection-4997b67e@skogheim.no"],
  ["postalAddress.addressLine1", v.postalAddress?.addressLine1 === "Parkveien 17"],
  ["postalAddress.postalCode", v.postalAddress?.postalCode === "4611"],
  ["postalAddress.city", v.postalAddress?.city === "Kristiansand"],
  ["id exists", typeof v.id === "number" && v.id > 0],
];

console.log("\n=== VERIFICATION ===");
for (const [field, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${field}`);
}
const allPass = checks.every(([, ok]) => ok);
console.log(`\nResult: ${allPass ? "ALL PASS" : "SOME FAILED"} (${checks.filter(([,ok]) => ok).length}/${checks.length})`);
