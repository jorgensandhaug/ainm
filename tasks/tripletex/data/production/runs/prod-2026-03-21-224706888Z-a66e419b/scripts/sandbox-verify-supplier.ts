const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const auth = "Basic " + btoa("0:" + token);

// Verify one-call create supplier with mirrored email still works
const res = await fetch(`${baseUrl}/supplier`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: auth },
  body: JSON.stringify({
    name: "Sandbox Verify AS",
    organizationNumber: "999999991",
    email: "faktura@sandboxverify.no",
    invoiceEmail: "faktura@sandboxverify.no",
  }),
});

const body = await res.json();
console.log("Status:", res.status);
console.log("Has value.id:", !!body.value?.id);
console.log("name:", body.value?.name);
console.log("organizationNumber:", body.value?.organizationNumber);
console.log("email:", body.value?.email);
console.log("invoiceEmail:", body.value?.invoiceEmail);
console.log("ledgerAccount.id:", body.value?.ledgerAccount?.id);
console.log("postalAddress.id:", body.value?.postalAddress?.id);
console.log("physicalAddress.id:", body.value?.physicalAddress?.id);
