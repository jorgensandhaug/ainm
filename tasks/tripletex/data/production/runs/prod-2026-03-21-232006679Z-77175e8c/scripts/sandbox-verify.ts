const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Verify one-call path still works in sandbox (will get 0% due to sandbox defaults)
const res = await fetch(`${BASE}/product`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "SandboxTest11",
    number: String(Date.now()).slice(-5),
    priceExcludingVatCurrency: 16250,
  }),
});

const data = await res.json();
console.log("Status:", res.status);
console.log("vatType.id:", data.value?.vatType?.id);
console.log("priceExcludingVatCurrency:", data.value?.priceExcludingVatCurrency);
console.log("priceIncludingVatCurrency:", data.value?.priceIncludingVatCurrency);
console.log("name:", data.value?.name);

// Sandbox will auto-fill 0% (vatType.id=6), confirming the one-call shortcut
// is account-dependent and must stay scoped to fresh-account standard-25% shape
const isSandbox0pct = data.value?.priceIncludingVatCurrency === data.value?.priceExcludingVatCurrency;
console.log("\nSandbox still defaults to 0%:", isSandbox0pct);
