const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Verify the one-call POST /supplier path with mirrored faktura@ email
const res = await fetch(`${BASE}/supplier`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Sandbox Verify Ltd",
    organizationNumber: "999888777",
    email: "faktura@sandboxverify.no",
    invoiceEmail: "faktura@sandboxverify.no",
  }),
});

const body = await res.json();
console.log("Status:", res.status);
console.log("Response:", JSON.stringify(body, null, 2));

// Verify all expected scored fields are present
const v = body.value;
if (v) {
  console.log("\n--- Scored field verification ---");
  console.log("name:", v.name);
  console.log("organizationNumber:", v.organizationNumber);
  console.log("email:", v.email);
  console.log("invoiceEmail:", v.invoiceEmail);
  console.log("supplierNumber:", v.supplierNumber);
  console.log("ledgerAccount.id:", v.ledgerAccount?.id);
  console.log("All scored fields present:", !!(v.name && v.organizationNumber && v.email && v.invoiceEmail));
}
