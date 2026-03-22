// Check supplier POST response for ledgerAccount field
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function main() {
  // Create a test supplier
  const res = await fetch(`${BASE}/supplier`, {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `Test supplier ledger ${Date.now()}`,
      organizationNumber: "871162069",
      postalAddress: { addressLine1: "X", postalCode: "9008", city: "Tromsø", country: { id: 161 } },
      physicalAddress: { addressLine1: "X", postalCode: "9008", city: "Tromsø", country: { id: 161 } },
      bankAccountPresentation: [{ bban: "28390913577" }],
    }),
  });
  const data = await res.json();
  const sup = data.value;

  // Check for ledgerAccount or account-related fields
  console.log("Full supplier response keys:", Object.keys(sup));
  console.log("\nLooking for account-related fields:");
  for (const [k, v] of Object.entries(sup)) {
    const s = String(k).toLowerCase();
    if (s.includes("account") || s.includes("ledger") || s.includes("vendor")) {
      console.log(`  ${k}:`, JSON.stringify(v));
    }
  }
  console.log("\nFull response:", JSON.stringify(sup, null, 2));
}

main().catch(console.error);
