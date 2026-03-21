const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Verify that 1-call supplier create with mirrored email still works
const res = await fetch(`${BASE}/supplier`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Sandbox Verify Lda",
    organizationNumber: "999888777",
    email: "faktura@sandboxverify.no",
    invoiceEmail: "faktura@sandboxverify.no",
  }),
});

const body = await res.json();
console.log("Status:", res.status);
console.log("name:", body.value?.name);
console.log("organizationNumber:", body.value?.organizationNumber);
console.log("email:", body.value?.email);
console.log("invoiceEmail:", body.value?.invoiceEmail);
console.log("id:", body.value?.id);
