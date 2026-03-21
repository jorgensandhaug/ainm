const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// 1. Verify sandbox product create without vatType still defaults to 0%
const res = await fetch(`${BASE}/product`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "SandboxTest-Datenberatung",
    number: 78550,
    priceExcludingVatCurrency: 41550,
  }),
});

const data = await res.json();
console.log("=== Sandbox POST /product without vatType ===");
console.log("Status:", res.status);
console.log("name:", data.value?.name);
console.log("number:", data.value?.number);
console.log("priceExcludingVatCurrency:", data.value?.priceExcludingVatCurrency);
console.log("priceIncludingVatCurrency:", data.value?.priceIncludingVatCurrency);
console.log("vatType.id:", data.value?.vatType?.id);
console.log("incl == excl (0% default)?", data.value?.priceIncludingVatCurrency === data.value?.priceExcludingVatCurrency);
