const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function main() {
  // Sandbox test: create a product with a unique number to verify shape
  const num = 99000 + Math.floor(Math.random() * 900);
  const res = await fetch(`${BASE}/product`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: AUTH },
    body: JSON.stringify({
      name: "SandboxTest",
      number: num,
      priceExcludingVatCurrency: 41500,
    }),
  });
  const data = await res.json();
  console.log("POST /product:", res.status);
  if (res.status === 201) {
    const v = data.value;
    console.log("id:", v.id);
    console.log("name:", v.name);
    console.log("number:", v.number);
    console.log("priceExcludingVatCurrency:", v.priceExcludingVatCurrency);
    console.log("priceIncludingVatCurrency:", v.priceIncludingVatCurrency);
    console.log("vatType:", JSON.stringify(v.vatType));
    // Note: sandbox defaults to 0% VAT (id=6), not 25%. This is expected.
    // The production run proved 25% works in fresh accounts.

    // Verify with GET
    const gRes = await fetch(`${BASE}/product/${v.id}?fields=*,vatType(*)`, {
      headers: { Authorization: AUTH },
    });
    const gData = await gRes.json();
    console.log("\nGET verification:", gRes.status);
    console.log("vatType details:", JSON.stringify(gData.value.vatType));
  } else {
    console.log("Response:", JSON.stringify(data, null, 2));
  }
}

main();
