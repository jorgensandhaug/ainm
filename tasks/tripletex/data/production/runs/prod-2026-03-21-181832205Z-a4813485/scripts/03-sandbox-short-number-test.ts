// Test productNumber query with short numbers (like production 7765/4369/5331)
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
  // Test with known short-number products from sandbox: 2109, 1175, 9974
  console.log("=== Multi-value: 2109, 1175, 9974 ===");
  const r1 = await api("GET", "/product?productNumber=2109&productNumber=1175&productNumber=9974&fields=*");
  console.log(`Results: ${r1.data?.values?.length}`);
  for (const p of r1.data?.values || []) {
    console.log(`  id=${p.id} number=${p.number} name="${p.name}"`);
  }

  // Test with other known short numbers: 6744, 2584, 3739
  console.log("\n=== Multi-value: 6744, 2584, 3739 ===");
  const r2 = await api("GET", "/product?productNumber=6744&productNumber=2584&productNumber=3739&fields=*");
  console.log(`Results: ${r2.data?.values?.length}`);
  for (const p of r2.data?.values || []) {
    console.log(`  id=${p.id} number=${p.number} name="${p.name}"`);
  }

  // Test with known short numbers: 4783, 3343, 4380
  console.log("\n=== Multi-value: 4783, 3343, 4380 ===");
  const r3 = await api("GET", "/product?productNumber=4783&productNumber=3343&productNumber=4380&fields=*");
  console.log(`Results: ${r3.data?.values?.length}`);
  for (const p of r3.data?.values || []) {
    console.log(`  id=${p.id} number=${p.number} name="${p.name}"`);
  }

  // Test with numbers that DON'T exist: simulating the production scenario
  console.log("\n=== Multi-value: 7765, 4369, 5331 (don't exist in sandbox) ===");
  const r4 = await api("GET", "/product?productNumber=7765&productNumber=4369&productNumber=5331&fields=*");
  console.log(`Results: ${r4.data?.values?.length}`);
  for (const p of r4.data?.values || []) {
    console.log(`  id=${p.id} number=${p.number} name="${p.name}"`);
  }

  // Test with mix of existing and non-existing
  console.log("\n=== Multi-value: 2109, 9999, 1175 (one doesn't exist) ===");
  const r5 = await api("GET", "/product?productNumber=2109&productNumber=9999&productNumber=1175&fields=*");
  console.log(`Results: ${r5.data?.values?.length}`);
  for (const p of r5.data?.values || []) {
    console.log(`  id=${p.id} number=${p.number} name="${p.name}"`);
  }
}

main().catch(console.error);
