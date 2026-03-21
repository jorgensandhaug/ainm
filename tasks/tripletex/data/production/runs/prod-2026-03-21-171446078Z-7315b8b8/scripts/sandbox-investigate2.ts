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

function showProducts(resp: any) {
  for (const p of resp.values || []) {
    console.log(`  id=${p.id} number=${p.number} productNumber=${p.productNumber} name=${p.name}`);
  }
  if (!resp.values?.length) {
    console.log(`  (no results)`);
    if (resp.validationMessages) console.log(`  validation: ${JSON.stringify(resp.validationMessages)}`);
  }
}

async function main() {
  // Check what products exist
  console.log("=== All products ===");
  const all = await api("GET", "/product?count=20&fields=*");
  showProducts(all);

  // Test productNumber query
  console.log("\n=== productNumber=5271&productNumber=3613 ===");
  const q1 = await api("GET", "/product?productNumber=5271&productNumber=3613&fields=*");
  showProducts(q1);

  // Test deprecated number query (comma-separated)
  console.log("\n=== number=5271,3613 ===");
  const q2 = await api("GET", "/product?number=5271,3613&fields=*");
  showProducts(q2);

  // Test deprecated number query (repeated)
  console.log("\n=== number=5271&number=3613 ===");
  const q3 = await api("GET", "/product?number=5271&number=3613&fields=*");
  showProducts(q3);

  // Test: combine both params
  console.log("\n=== productNumber=5271&productNumber=3613&number=5271,3613 ===");
  const q4 = await api("GET", "/product?productNumber=5271&productNumber=3613&number=5271,3613&fields=*");
  showProducts(q4);
}

main().catch(e => { console.error(e); process.exit(1); });
