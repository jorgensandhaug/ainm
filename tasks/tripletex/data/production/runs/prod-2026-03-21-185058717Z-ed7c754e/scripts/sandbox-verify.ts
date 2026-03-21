const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const auth = "Basic " + btoa("0:" + TOKEN);

// Sandbox verification: create a supplier with Unicode name and mirrored faktura@ email
const ts = Date.now();
const res = await fetch(`${BASE}/supplier`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: auth },
  body: JSON.stringify({
    name: `Rivière Reflection ${ts} SARL`,
    organizationNumber: "853420409",
    email: "faktura@riviresarl.no",
    invoiceEmail: "faktura@riviresarl.no",
  }),
});

console.log("status:", res.status);
const data = await res.json();
console.log(JSON.stringify(data, null, 2));

// Verify all scored fields present in response
if (res.status === 201) {
  const v = data.value;
  console.log("\n--- Verification ---");
  console.log("name:", v.name);
  console.log("organizationNumber:", v.organizationNumber);
  console.log("email:", v.email);
  console.log("invoiceEmail:", v.invoiceEmail);
  console.log("id:", v.id);
  console.log("All scored fields present in POST response:",
    v.name && v.organizationNumber && v.email && v.invoiceEmail ? "YES" : "NO");
}
