const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  console.log(`\n${method} ${path} => ${r.status}`);
  return json;
}

async function main() {
  // Create a product with an explicit productNumber that differs from number
  console.log("=== Create product with explicit productNumber ===");
  const p1 = await api("POST", "/product", {
    name: "TestProd Explicit PN",
    number: 9999,
    productNumber: "CUSTOM-9999",
    priceExcludingVatCurrency: 100,
  });
  const prod1 = p1.value;
  console.log(`  id=${prod1?.id} number=${prod1?.number} productNumber=${prod1?.productNumber} name=${prod1?.name}`);

  // Create another product with only number, no explicit productNumber
  console.log("\n=== Create product with only number ===");
  const p2 = await api("POST", "/product", {
    name: "TestProd Number Only",
    number: 8888,
    priceExcludingVatCurrency: 200,
  });
  const prod2 = p2.value;
  console.log(`  id=${prod2?.id} number=${prod2?.number} productNumber=${prod2?.productNumber} name=${prod2?.name}`);

  // Now test queries
  console.log("\n=== Query: productNumber=9999 (should NOT match prod1 since productNumber=CUSTOM-9999) ===");
  const q1 = await api("GET", "/product?productNumber=9999&fields=*");
  for (const p of q1.values || []) console.log(`  id=${p.id} number=${p.number} productNumber=${p.productNumber} name=${p.name}`);
  if (!q1.values?.length) console.log("  (no results)");

  console.log("\n=== Query: productNumber=CUSTOM-9999 ===");
  const q2 = await api("GET", "/product?productNumber=CUSTOM-9999&fields=*");
  for (const p of q2.values || []) console.log(`  id=${p.id} number=${p.number} productNumber=${p.productNumber} name=${p.name}`);
  if (!q2.values?.length) console.log("  (no results)");

  console.log("\n=== Query: number=9999 (deprecated) ===");
  const q3 = await api("GET", "/product?number=9999&fields=*");
  for (const p of q3.values || []) console.log(`  id=${p.id} number=${p.number} productNumber=${p.productNumber} name=${p.name}`);
  if (!q3.values?.length) console.log("  (no results)");

  console.log("\n=== Query: productNumber=8888 (should match prod2 by number fallback?) ===");
  const q4 = await api("GET", "/product?productNumber=8888&fields=*");
  for (const p of q4.values || []) console.log(`  id=${p.id} number=${p.number} productNumber=${p.productNumber} name=${p.name}`);
  if (!q4.values?.length) console.log("  (no results)");

  console.log("\n=== Query: number=8888 ===");
  const q5 = await api("GET", "/product?number=8888&fields=*");
  for (const p of q5.values || []) console.log(`  id=${p.id} number=${p.number} productNumber=${p.productNumber} name=${p.name}`);
  if (!q5.values?.length) console.log("  (no results)");

  // Test combined: productNumber + number for cross-field matching
  console.log("\n=== Query: productNumber=CUSTOM-9999&number=8888 (should find BOTH products?) ===");
  const q6 = await api("GET", "/product?productNumber=CUSTOM-9999&number=8888&fields=*");
  for (const p of q6.values || []) console.log(`  id=${p.id} number=${p.number} productNumber=${p.productNumber} name=${p.name}`);
  if (!q6.values?.length) console.log("  (no results)");

  // Test: productNumber=9999&productNumber=8888 (both as productNumber)
  console.log("\n=== Query: productNumber=9999&productNumber=8888 ===");
  const q7 = await api("GET", "/product?productNumber=9999&productNumber=8888&fields=*");
  for (const p of q7.values || []) console.log(`  id=${p.id} number=${p.number} productNumber=${p.productNumber} name=${p.name}`);
  if (!q7.values?.length) console.log("  (no results)");
}

main().catch(e => { console.error(e); process.exit(1); });
