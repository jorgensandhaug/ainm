// Sandbox verification: confirm POST /supplier with mirrored email still works
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/supplier`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Sandbox Verify Ltd",
    organizationNumber: "999999999",
    email: "faktura@sandboxverify.no",
    invoiceEmail: "faktura@sandboxverify.no",
  }),
});

console.log("Status:", res.status);
const data = await res.json();
console.log(JSON.stringify(data, null, 2));

// Verify all scored fields present
const v = data.value;
console.log("\n--- Scored Field Verification ---");
console.log("name:", v.name);
console.log("organizationNumber:", v.organizationNumber);
console.log("email:", v.email);
console.log("invoiceEmail:", v.invoiceEmail);
console.log("id:", v.id);
console.log("ledgerAccount.id:", v.ledgerAccount?.id);
console.log("All scored fields present:", !!(v.name && v.organizationNumber && v.email && v.invoiceEmail));
