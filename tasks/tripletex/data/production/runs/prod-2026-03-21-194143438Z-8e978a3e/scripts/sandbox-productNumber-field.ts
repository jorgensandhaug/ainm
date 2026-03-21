// Test: is productNumber a valid query parameter vs field for GET /product?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method, headers });
  const json = await res.json();
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) console.log(JSON.stringify(json, null, 2));
  return { status: res.status, ok: res.ok, json };
}

async function main() {
  // Test 1: fields=productNumber → 400 (not a valid field)
  console.log("--- Test 1: fields=productNumber ---");
  await api("GET", "/product?count=5&fields=id,productNumber");

  // Test 2: fields=* works and see what fields come back
  console.log("\n--- Test 2: fields=* (check if productNumber is in response) ---");
  const r2 = await api("GET", "/product?count=2&fields=*");
  if (r2.ok && r2.json.values[0]) {
    const p = r2.json.values[0];
    console.log("Has 'number':", "number" in p, "value:", p.number);
    console.log("Has 'productNumber':", "productNumber" in p, "value:", (p as any).productNumber);
  }

  // Test 3: productNumber as a query parameter (not field)
  console.log("\n--- Test 3: productNumber as query param ---");
  const r3 = await api("GET", "/product?productNumber=7579&fields=id,name,number");
  if (r3.ok) {
    console.log("Products found:", r3.json.values.length);
    r3.json.values.forEach((p: any) => console.log(`  ${p.name} (number=${p.number}, id=${p.id})`));
  }

  // Test 4: number as a query parameter
  console.log("\n--- Test 4: number as query param ---");
  const r4 = await api("GET", "/product?number=7579&fields=id,name,number");
  if (r4.ok) {
    console.log("Products found:", r4.json.values.length);
    r4.json.values.forEach((p: any) => console.log(`  ${p.name} (number=${p.number}, id=${p.id})`));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
