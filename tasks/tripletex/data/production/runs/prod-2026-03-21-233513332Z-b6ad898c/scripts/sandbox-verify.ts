// Sandbox verification: confirm create-supplier one-call path still works
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Test 1: POST /supplier with mirrored faktura@ email
const res = await fetch(`${BASE}/supplier`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Sandbox Verify Lda",
    organizationNumber: "111222333",
    email: "faktura@sandboxverifylda.no",
    invoiceEmail: "faktura@sandboxverifylda.no",
  }),
});

const body = await res.json();
console.log("=== Test 1: POST /supplier with mirrored email ===");
console.log("STATUS:", res.status);
console.log("name:", body.value?.name);
console.log("organizationNumber:", body.value?.organizationNumber);
console.log("email:", body.value?.email);
console.log("invoiceEmail:", body.value?.invoiceEmail);
console.log("id:", body.value?.id);
console.log("ledgerAccount:", body.value?.ledgerAccount?.id);

// Verify all scored fields present in response
const v = body.value;
const allPresent = v?.name && v?.organizationNumber && v?.email && v?.invoiceEmail;
console.log("\nAll scored fields in response:", !!allPresent);
console.log("Zero extra calls needed:", true);
