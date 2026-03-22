const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Verify the exact same 1-call path works in sandbox
const res = await fetch(`${BASE}/supplier`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Sandbox Lumière Test",
    organizationNumber: "999999999",
    email: "faktura@test.no",
    invoiceEmail: "faktura@test.no",
  }),
});

console.log("STATUS:", res.status);
const body = await res.json();
console.log("BODY:", JSON.stringify(body, null, 2));

// Verify scored fields present in response
const v = body.value;
console.log("\n=== SCORED FIELD VERIFICATION ===");
console.log("name:", v.name);
console.log("organizationNumber:", v.organizationNumber);
console.log("email:", v.email);
console.log("invoiceEmail:", v.invoiceEmail);
console.log("id:", v.id);
console.log("ledgerAccount.id:", v.ledgerAccount?.id);
console.log("All scored fields present:", !!(v.name && v.organizationNumber && v.email && v.invoiceEmail));
