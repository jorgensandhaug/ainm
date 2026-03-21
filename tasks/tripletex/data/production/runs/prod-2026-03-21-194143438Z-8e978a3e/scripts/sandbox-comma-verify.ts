// Verify: comma-separated number query works with 3+ products
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method, headers });
  const json = await res.json();
  console.log(`\n${method} ${path} → ${res.status}`);
  if (!res.ok) console.log(JSON.stringify(json, null, 2));
  return { status: res.status, ok: res.ok, json };
}

async function main() {
  // Test 1: 3 products comma-separated
  console.log("--- Test 1: 3 products comma-separated ---");
  const r1 = await api("GET", "/product?number=7579,2292,4366&fields=id,name,number");
  if (r1.ok) {
    console.log(`Found ${r1.json.values.length} products (expected 3)`);
    r1.json.values.forEach((p: any) => console.log(`  ${p.name} (number=${p.number})`));
  }

  // Test 2: 2 products that exist in sandbox with different number ranges
  console.log("\n--- Test 2: number=4783,3343 ---");
  const r2 = await api("GET", "/product?number=4783,3343&fields=id,name,number");
  if (r2.ok) {
    console.log(`Found ${r2.json.values.length} products (expected 2)`);
    r2.json.values.forEach((p: any) => console.log(`  ${p.name} (number=${p.number})`));
  }

  // Test 3: one product that exists, one that doesn't
  console.log("\n--- Test 3: number=7579,99999 (1 exists, 1 doesn't) ---");
  const r3 = await api("GET", "/product?number=7579,99999&fields=id,name,number");
  if (r3.ok) {
    console.log(`Found ${r3.json.values.length} products (expected 1)`);
    r3.json.values.forEach((p: any) => console.log(`  ${p.name} (number=${p.number})`));
  }

  // Test 4: Does this work with fields=* too?
  console.log("\n--- Test 4: number=7579,2292&fields=* ---");
  const r4 = await api("GET", "/product?number=7579,2292&fields=*");
  if (r4.ok) {
    console.log(`Found ${r4.json.values.length} products (expected 2)`);
    r4.json.values.forEach((p: any) => console.log(`  ${p.name} (number=${p.number}, id=${p.id})`));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
