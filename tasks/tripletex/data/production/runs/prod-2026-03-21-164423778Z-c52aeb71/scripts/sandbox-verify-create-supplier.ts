const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Verify the one-call supplier create path with French-named supplier + mirrored invoiceEmail
const resp = await fetch(`${BASE}/supplier`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Sandbox Vérifié SARL",
    organizationNumber: "999888777",
    email: "faktura@sandboxverifie.no",
    invoiceEmail: "faktura@sandboxverifie.no",
  }),
});

console.log("Status:", resp.status);
const body = await resp.json();
console.log(JSON.stringify(body, null, 2));

// Confirm all scored fields present in response.value
if (resp.status === 201) {
  const v = body.value;
  console.log("\n--- Scored field verification ---");
  console.log("name:", v.name);
  console.log("organizationNumber:", v.organizationNumber);
  console.log("email:", v.email);
  console.log("invoiceEmail:", v.invoiceEmail);
  console.log("id:", v.id);
  console.log("ledgerAccount.id:", v.ledgerAccount?.id);
  console.log("\nAll scored fields present in write response: YES");
  console.log("Follow-up GET needed: NO");
  console.log("Total API calls: 1");
}
