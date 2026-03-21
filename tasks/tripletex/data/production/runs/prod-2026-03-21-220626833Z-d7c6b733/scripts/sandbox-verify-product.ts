const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Test 1: POST /product without vatType (sandbox default behavior)
const res = await fetch(`${BASE}/product`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Sandbox Training Session Test",
    number: "SBX-" + Date.now(),
    priceExcludingVatCurrency: 26250,
  }),
});

const data = await res.json();
console.log("=== Sandbox POST /product without vatType ===");
console.log("Status:", res.status);
console.log("name:", data.value?.name);
console.log("priceExcludingVatCurrency:", data.value?.priceExcludingVatCurrency);
console.log("priceIncludingVatCurrency:", data.value?.priceIncludingVatCurrency);
console.log("vatType.id:", data.value?.vatType?.id);
console.log("Expected: sandbox defaults to 0% VAT (inclVAT == exclVAT)");
console.log("Match 0%:", data.value?.priceIncludingVatCurrency === data.value?.priceExcludingVatCurrency);
