const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method, headers });
  const json = await r.json();
  console.log(`\n${method} ${path} => ${r.status}`);
  return json;
}

async function main() {
  // 1. First, list all products to see their number vs productNumber fields
  console.log("=== All products (first 20) ===");
  const allResp = await api("GET", "/product?count=20&fields=id,number,productNumber,name");
  for (const p of allResp.values || []) {
    console.log(`  id=${p.id} number=${p.number} productNumber=${p.productNumber} name=${p.name}`);
  }

  if (!allResp.values?.length) {
    console.log("No products in sandbox. Creating test products first...");
    // Create two products: one with a specific number
    const p1 = await fetch(`${BASE}/product`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "TestProd A", number: 5271, priceExcludingVatCurrency: 100 }),
    }).then(r => r.json());
    console.log("Created product 1:", JSON.stringify(p1.value ? { id: p1.value.id, number: p1.value.number, productNumber: p1.value.productNumber } : p1, null, 2));

    const p2 = await fetch(`${BASE}/product`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "TestProd B", number: 3613, priceExcludingVatCurrency: 200 }),
    }).then(r => r.json());
    console.log("Created product 2:", JSON.stringify(p2.value ? { id: p2.value.id, number: p2.value.number, productNumber: p2.value.productNumber } : p2, null, 2));
  }

  // 2. Test different query strategies
  console.log("\n=== Query: productNumber=5271&productNumber=3613 ===");
  const q1 = await api("GET", "/product?productNumber=5271&productNumber=3613&fields=id,number,productNumber,name");
  console.log(`  Found: ${q1.values?.length || 0} products`);
  for (const p of q1.values || []) {
    console.log(`  id=${p.id} number=${p.number} productNumber=${p.productNumber} name=${p.name}`);
  }

  console.log("\n=== Query: number=5271 (deprecated param) ===");
  const q2 = await api("GET", "/product?number=5271&fields=id,number,productNumber,name");
  console.log(`  Found: ${q2.values?.length || 0} products`);
  for (const p of q2.values || []) {
    console.log(`  id=${p.id} number=${p.number} productNumber=${p.productNumber} name=${p.name}`);
  }

  console.log("\n=== Query: number=5271,3613 (deprecated param, comma-separated) ===");
  const q3 = await api("GET", "/product?number=5271,3613&fields=id,number,productNumber,name");
  console.log(`  Found: ${q3.values?.length || 0} products`);
  for (const p of q3.values || []) {
    console.log(`  id=${p.id} number=${p.number} productNumber=${p.productNumber} name=${p.name}`);
  }

  console.log("\n=== Query: productNumber=5271&productNumber=3613&number=5271,3613 (both params) ===");
  const q4 = await api("GET", "/product?productNumber=5271&productNumber=3613&number=5271,3613&fields=id,number,productNumber,name");
  console.log(`  Found: ${q4.values?.length || 0} products`);
  for (const p of q4.values || []) {
    console.log(`  id=${p.id} number=${p.number} productNumber=${p.productNumber} name=${p.name}`);
  }

  // 3. Test with number=5271&number=3613 (repeated param)
  console.log("\n=== Query: number=5271&number=3613 (repeated deprecated param) ===");
  const q5 = await api("GET", "/product?number=5271&number=3613&fields=id,number,productNumber,name");
  console.log(`  Found: ${q5.values?.length || 0} products`);
  for (const p of q5.values || []) {
    console.log(`  id=${p.id} number=${p.number} productNumber=${p.productNumber} name=${p.name}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
