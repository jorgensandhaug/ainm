// Test: alternative number query formats
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
  // Test 1: number with comma-separated values
  console.log("--- Test 1: number=7579,2292 (comma-separated) ---");
  const r1 = await api("GET", "/product?number=7579,2292&fields=id,name,number");
  if (r1.ok) {
    console.log(`Found ${r1.json.values.length} products`);
    r1.json.values.forEach((p: any) => console.log(`  ${p.name} (number=${p.number})`));
  }

  // Test 2: Can we use name as a query param to filter?
  console.log("\n--- Test 2: name filter ---");
  const r2 = await api("GET", "/product?name=Opplæring&fields=id,name,number");
  if (r2.ok) {
    console.log(`Found ${r2.json.values.length} products`);
    r2.json.values.forEach((p: any) => console.log(`  ${p.name} (number=${p.number})`));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
