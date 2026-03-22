const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Verify the one-call create-supplier path in sandbox
const res = await fetch(`${BASE}/supplier`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Sandbox Verify SARL",
    organizationNumber: "915612865",
    email: "faktura@sandboxverify.no",
    invoiceEmail: "faktura@sandboxverify.no",
  }),
});

const body = await res.json();
console.log("Status:", res.status);
console.log("Response:", JSON.stringify(body, null, 2));

// Verify all scored fields are present in the response
if (res.status === 201) {
  const v = body.value;
  console.log("\n--- Scored Field Verification ---");
  console.log("name:", v.name);
  console.log("organizationNumber:", v.organizationNumber);
  console.log("email:", v.email);
  console.log("invoiceEmail:", v.invoiceEmail);
  console.log("id:", v.id);
  console.log("supplierNumber:", v.supplierNumber);
  console.log("All scored fields present:", !!(v.name && v.organizationNumber && v.email && v.invoiceEmail));
}
