const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Test 1: GET filtered OUTGOING VAT types
console.log("=== Test 1: GET OUTGOING VAT types ===");
const vatRes = await fetch(`${BASE}/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*`, { headers: H });
const vatBody = await vatRes.json();
console.log("Status:", vatRes.status);
const vatTypes = vatBody.values || [];
console.log("OUTGOING VAT types:", vatTypes.map((v: any) => `id=${v.id} ${v.percentage}% name=${v.name} number=${v.number}`));

const zeroVat = vatTypes.find((v: any) => v.percentage === 0);
console.log("0% VAT:", zeroVat ? `id=${zeroVat.id} number=${zeroVat.number}` : "NOT FOUND");

// Test 2: POST product with explicit 0% vatType (standard 2-call path)
console.log("\n=== Test 2: POST product with explicit vatType (2-call path) ===");
const num1 = 77000 + Math.floor(Math.random() * 1000);
const prod1 = {
  name: "Sandbox 0pct test " + num1,
  number: num1,
  priceExcludingVatCurrency: 18250,
  vatType: { id: zeroVat!.id },
};
const r1 = await fetch(`${BASE}/product`, { method: "POST", headers: H, body: JSON.stringify(prod1) });
const b1 = await r1.json();
console.log("Status:", r1.status);
if (r1.ok) {
  const v = b1.value;
  console.log("Created:", { id: v.id, name: v.name, number: v.number, priceExcl: v.priceExcludingVatCurrency, priceIncl: v.priceIncludingVatCurrency, vatId: v.vatType?.id });
}

// Test 3: POST product WITHOUT vatType to check what default the sandbox gives
console.log("\n=== Test 3: POST product WITHOUT vatType (1-call shortcut test) ===");
const num2 = 78000 + Math.floor(Math.random() * 1000);
const prod2 = {
  name: "Sandbox no-vat test " + num2,
  number: num2,
  priceExcludingVatCurrency: 18250,
};
const r2 = await fetch(`${BASE}/product`, { method: "POST", headers: H, body: JSON.stringify(prod2) });
const b2 = await r2.json();
console.log("Status:", r2.status);
if (r2.ok) {
  const v = b2.value;
  console.log("Created:", { id: v.id, name: v.name, number: v.number, priceExcl: v.priceExcludingVatCurrency, priceIncl: v.priceIncludingVatCurrency, vatId: v.vatType?.id });
  console.log("Default VAT is 0%?", v.priceExcludingVatCurrency === v.priceIncludingVatCurrency);
} else {
  console.log("Error:", JSON.stringify(b2));
}

// Test 4: POST product with hardcoded vatType id=5 (fresh-account 0% id) to see if sandbox rejects it
console.log("\n=== Test 4: POST product with hardcoded vatType id=5 (fresh-account id) ===");
const num3 = 79000 + Math.floor(Math.random() * 1000);
const prod3 = {
  name: "Sandbox hardcode-5 test " + num3,
  number: num3,
  priceExcludingVatCurrency: 18250,
  vatType: { id: 5 },
};
const r3 = await fetch(`${BASE}/product`, { method: "POST", headers: H, body: JSON.stringify(prod3) });
const b3 = await r3.json();
console.log("Status:", r3.status);
if (r3.ok) {
  const v = b3.value;
  console.log("Created:", { id: v.id, vatId: v.vatType?.id, priceIncl: v.priceIncludingVatCurrency });
} else {
  console.log("Error:", JSON.stringify(b3));
}
