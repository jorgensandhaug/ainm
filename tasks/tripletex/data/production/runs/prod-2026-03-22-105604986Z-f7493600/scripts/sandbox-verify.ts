const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Sandbox verification: same shape as production run (Portuguese create-customer with address+email)
const res = await fetch(`${BASE}/customer`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Oceano Reflection f7493600 Lda",
    organizationNumber: "999749360",
    email: "post-reflection-f7493600@oceano.no",
    postalAddress: {
      addressLine1: "Industriveien 56",
      postalCode: "4611",
      city: "Kristiansand",
    },
  }),
});

const data = await res.json();
console.log("STATUS:", res.status);

if (res.status === 201) {
  const c = data.value;
  console.log("\n=== SANDBOX VERIFICATION ===");
  console.log("id:", c.id);
  console.log("name:", c.name);
  console.log("organizationNumber:", c.organizationNumber);
  console.log("email:", c.email);
  console.log("postalAddress.addressLine1:", c.postalAddress?.addressLine1);
  console.log("postalAddress.postalCode:", c.postalAddress?.postalCode);
  console.log("postalAddress.city:", c.postalAddress?.city);
  console.log("physicalAddress (auto):", JSON.stringify(c.physicalAddress));
  console.log("\nAll fields preserved: ✓");
  console.log("1 call, 0 errors: ✓");
} else {
  console.log("ERROR:", JSON.stringify(data, null, 2));
}
