// Test productNumber multi-value query behavior in sandbox
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string) {
  const r = await fetch(`${BASE}${path}`, { method, headers: H });
  const json = await r.json();
  return { status: r.status, data: json };
}

async function main() {
  // 1. Get all products in sandbox to see what exists
  console.log("=== Full product catalog ===");
  const catRes = await api("GET", "/product?count=100&fields=*");
  const products = catRes.data?.values || [];
  console.log(`Total products: ${products.length}`);
  for (const p of products) {
    console.log(`  id=${p.id} number=${p.number} name="${p.name}" vatType=${JSON.stringify(p.vatType)}`);
  }

  if (products.length >= 3) {
    // 2. Try multi-value productNumber query with first 3 products
    const nums = products.slice(0, 3).map((p: any) => p.number);
    const qp = nums.map((n: any) => `productNumber=${n}`).join("&");
    console.log(`\n=== Multi-value productNumber query: ${qp} ===`);
    const specRes = await api("GET", `/product?${qp}&fields=*`);
    const specProducts = specRes.data?.values || [];
    console.log(`Results: ${specProducts.length}`);
    for (const p of specProducts) {
      console.log(`  id=${p.id} number=${p.number} name="${p.name}"`);
    }

    // 3. Try single productNumber queries
    for (const n of nums) {
      console.log(`\n=== Single productNumber=${n} ===`);
      const singleRes = await api("GET", `/product?productNumber=${n}&fields=*`);
      const singleProducts = singleRes.data?.values || [];
      console.log(`Results: ${singleProducts.length}`);
      for (const p of singleProducts) {
        console.log(`  id=${p.id} number=${p.number} name="${p.name}"`);
      }
    }
  }
}

main().catch(console.error);
