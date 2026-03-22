const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  // Test 1: Can we pass vatType by number instead of id?
  console.log("=== Test 1: vatType by number ===");
  const res1 = await fetch(`${BASE}/product`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: "Test vatType by number",
      number: String(90000 + Math.floor(Math.random() * 9000)),
      priceExcludingVatCurrency: 100,
      vatType: { number: "6" },
    }),
  });
  const data1 = await res1.json();
  console.log("Status:", res1.status);
  console.log("Response:", JSON.stringify(data1, null, 2));

  // Test 2: Can we pass vatType by percentage?
  console.log("\n=== Test 2: vatType by percentage ===");
  const res2 = await fetch(`${BASE}/product`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: "Test vatType by percentage",
      number: String(90000 + Math.floor(Math.random() * 9000)),
      priceExcludingVatCurrency: 100,
      vatType: { percentage: 0 },
    }),
  });
  const data2 = await res2.json();
  console.log("Status:", res2.status);
  console.log("Response:", JSON.stringify(data2, null, 2));

  // Test 3: Can we pass vatType with number "5" (fresh account 0% code)?
  console.log("\n=== Test 3: vatType number='5' ===");
  const res3 = await fetch(`${BASE}/product`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: "Test vatType number 5",
      number: String(90000 + Math.floor(Math.random() * 9000)),
      priceExcludingVatCurrency: 100,
      vatType: { number: "5" },
    }),
  });
  const data3 = await res3.json();
  console.log("Status:", res3.status);
  console.log("Response:", JSON.stringify(data3, null, 2));
}

main().catch(console.error);
