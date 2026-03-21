const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Test 1: GET outgoing VAT types — check 0% row
console.log("=== Test 1: GET OUTGOING vatTypes ===");
const vatResp = await fetch(
  `${BASE}/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-22&fields=*`,
  { headers: H }
);
const vatData = await vatResp.json();
console.log("Status:", vatResp.status);
const vatTypes = vatData.values ?? [vatData.value];
console.log("OUTGOING vatTypes count:", vatTypes.length);
for (const v of vatTypes) {
  console.log(`  id=${v.id} percentage=${v.percentage} name=${v.name} number=${v.number}`);
}
const zeroVat = vatTypes.find((v: any) => v.percentage === 0);
console.log("0% row:", zeroVat ? `id=${zeroVat.id}` : "NOT FOUND");

// Test 2: POST /product with explicit 0% vatType
console.log("\n=== Test 2: POST /product with explicit vatType ===");
const product1 = {
  name: "SandboxAvis",
  number: 99201,
  priceExcludingVatCurrency: 4150,
  vatType: { id: zeroVat!.id },
};
const resp1 = await fetch(`${BASE}/product`, {
  method: "POST",
  headers: H,
  body: JSON.stringify(product1),
});
const data1 = await resp1.json();
console.log("Status:", resp1.status);
if (resp1.status === 201) {
  const v = data1.value;
  console.log("id:", v.id, "name:", v.name, "number:", v.number);
  console.log("priceExcludingVatCurrency:", v.priceExcludingVatCurrency);
  console.log("priceIncludingVatCurrency:", v.priceIncludingVatCurrency);
  console.log("vatType.id:", v.vatType?.id);
} else {
  console.log("Error:", JSON.stringify(data1));
}

// Test 3: POST /product WITHOUT vatType — check what sandbox defaults to
console.log("\n=== Test 3: POST /product WITHOUT vatType ===");
const product2 = {
  name: "SandboxAvisNoVat",
  number: 99202,
  priceExcludingVatCurrency: 4150,
};
const resp2 = await fetch(`${BASE}/product`, {
  method: "POST",
  headers: H,
  body: JSON.stringify(product2),
});
const data2 = await resp2.json();
console.log("Status:", resp2.status);
if (resp2.status === 201) {
  const v = data2.value;
  console.log("id:", v.id, "name:", v.name, "number:", v.number);
  console.log("priceExcludingVatCurrency:", v.priceExcludingVatCurrency);
  console.log("priceIncludingVatCurrency:", v.priceIncludingVatCurrency);
  console.log("vatType.id:", v.vatType?.id);
  console.log("vatType auto-filled 0%?", v.priceIncludingVatCurrency === v.priceExcludingVatCurrency);
} else {
  console.log("Error:", JSON.stringify(data2));
}
