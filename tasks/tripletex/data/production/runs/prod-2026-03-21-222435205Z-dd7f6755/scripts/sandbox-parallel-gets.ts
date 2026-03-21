// Sandbox investigation: verify parallelized 3 GETs work correctly
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method, headers: h });
  const json = await r.json();
  console.log(`${method} ${path} => ${r.status}`);
  return { status: r.status, json };
}

// Test 1: Parallel GETs — all 3 reads at once
console.log("=== TEST 1: Parallel GETs ===");
const t0 = Date.now();
const [custR, prodR, ptR] = await Promise.all([
  api("GET", "/customer?count=1&fields=id,name,organizationNumber"),
  api("GET", "/product?count=2&fields=id,number,name"),
  api("GET", "/invoice/paymentType?count=1&fields=id,description"),
]);
const t1 = Date.now();
console.log(`Parallel time: ${t1 - t0}ms`);
console.log("Customer:", custR.json.values?.[0]?.name);
console.log("Products:", prodR.json.values?.map((p: any) => `${p.number}:${p.name}`));
console.log("PaymentType:", ptR.json.values?.[0]?.description);

// Test 2: Sequential GETs for comparison
console.log("\n=== TEST 2: Sequential GETs ===");
const t2 = Date.now();
await api("GET", "/customer?count=1&fields=id,name,organizationNumber");
await api("GET", "/product?count=2&fields=id,number,name");
await api("GET", "/invoice/paymentType?count=1&fields=id,description");
const t3 = Date.now();
console.log(`Sequential time: ${t3 - t2}ms`);

console.log(`\nParallel saved: ${(t3 - t2) - (t1 - t0)}ms`);
