const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`\n>>> ${method} ${url}`);
  const res = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json();
  console.log(`Status: ${res.status}`);
  return { status: res.status, json };
}

// Test with simple numeric product numbers (similar to production)
// Products: 2109, 1175, 9974, 7579, 2292
console.log("=== TEST: productNumber query with simple numeric numbers ===");
const t1 = await api("GET", "/product?productNumber=2109&productNumber=1175&productNumber=9974&fields=*");
console.log(`Returned ${t1.json.values?.length || 0} products:`);
for (const p of (t1.json.values || [])) {
  console.log(`  Product #${p.number} (id=${p.id}): ${p.name}`);
}

// Also test with 4-digit numbers
console.log("\n=== TEST: productNumber with 4-digit numbers ===");
const t2 = await api("GET", "/product?productNumber=7579&productNumber=2292&fields=*");
console.log(`Returned ${t2.json.values?.length || 0} products:`);
for (const p of (t2.json.values || [])) {
  console.log(`  Product #${p.number} (id=${p.id}): ${p.name}`);
}

// Test: can productNumber match against product.number or is it a separate field?
// Some products have numbers like "2109", "4783", "6744" etc.
console.log("\n=== TEST: productNumber=4783 (single) ===");
const t3 = await api("GET", "/product?productNumber=4783&fields=*");
console.log(`Returned ${t3.json.values?.length || 0} products:`);
for (const p of (t3.json.values || [])) {
  console.log(`  Product #${p.number} (id=${p.id}): ${p.name}`);
}

// Test: what does 'number' look like for these products?
// Let me check if the product.number is the exact string or has leading zeros
console.log("\n=== TEST: Check product.number raw value ===");
const cat = await api("GET", "/product?productNumber=2109&fields=id,number,name");
if (cat.json.values?.length > 0) {
  const p = cat.json.values[0];
  console.log(`Product number type: ${typeof p.number}, value: '${p.number}'`);
}
