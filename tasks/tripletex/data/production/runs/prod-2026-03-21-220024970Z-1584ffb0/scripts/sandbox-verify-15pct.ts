const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Check what OUTGOING VAT types exist in the persistent sandbox
const vatRes = await fetch(
  `${BASE}/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*`,
  { headers: H }
);
const vatData = await vatRes.json();
console.log("VAT status:", vatRes.status);
console.log("OUTGOING VAT types:", JSON.stringify(vatData.values?.map((r: any) => ({
  id: r.id,
  number: r.number,
  percentage: r.percentage,
  name: r.name,
})), null, 2));

// Check if 15% exists in OUTGOING
const match15 = vatData.values?.filter((r: any) => r.percentage === 15) ?? [];
console.log("\n15% OUTGOING matches:", match15.length, JSON.stringify(match15.map((r: any) => ({ id: r.id, number: r.number, name: r.name }))));

// If 15% exists, try creating a product with it
if (match15.length > 0) {
  const vatId = match15.sort((a: any, b: any) => a.id - b.id)[0].id;
  console.log("\nTrying POST /product with vatType.id=" + vatId);
  const prodRes = await fetch(`${BASE}/product`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: "Sandbox-Eplejuice-15pct-test",
      number: "99926",
      priceExcludingVatCurrency: 49700,
      vatType: { id: vatId },
    }),
  });
  const prodData = await prodRes.json();
  console.log("Product status:", prodRes.status);
  console.log("Product response:", JSON.stringify(prodData.value ?? prodData, null, 2));
} else {
  console.log("\nSandbox has no 15% OUTGOING VAT — cannot verify 15% product create here");
  console.log("This is consistent with prior sandbox findings (only 0% OUTGOING)");
}
