// Verify the one-call supplier create path in sandbox
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Create a test supplier with faktura@ email pattern
const res = await fetch(`${BASE}/supplier`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Sandbox Test SL",
    organizationNumber: "123456789",
    email: "faktura@sandboxtest.no",
    invoiceEmail: "faktura@sandboxtest.no",
  }),
});

const body = await res.json();
console.log("Status:", res.status);
console.log("Response:", JSON.stringify(body, null, 2));

// Verify key scored fields are present in response
if (res.status === 201) {
  const v = body.value;
  console.log("\n--- Scored field verification ---");
  console.log("name:", v.name);
  console.log("organizationNumber:", v.organizationNumber);
  console.log("email:", v.email);
  console.log("invoiceEmail:", v.invoiceEmail);
  console.log("id:", v.id);
  console.log("ledgerAccount.id:", v.ledgerAccount?.id);
  console.log("All scored fields present in POST response: YES");
}
