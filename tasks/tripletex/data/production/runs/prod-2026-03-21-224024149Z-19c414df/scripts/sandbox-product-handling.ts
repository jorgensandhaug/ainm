// Sandbox investigation: product handling when products may already exist
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = BASE + path;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`\n${method} ${path} → ${r.status}`);
  if (!r.ok) console.log(JSON.stringify(json, null, 2));
  return { status: r.status, data: json };
}

async function main() {
  console.log("=== 1. Check existing products ===");
  const allProds = await api("GET", "/product?fields=id,number,name&count=100");
  const products = allProds.data?.values || [];
  console.log(`Total products: ${products.length}`);
  for (const p of products) {
    console.log(`  number=${p.number} (type: ${typeof p.number}), id=${p.id}, name=${p.name}`);
  }

  console.log("\n=== 2. Test GET /product with number filter ===");
  // Try filtering by specific number
  const filtered = await api("GET", "/product?number=9796&fields=id,number,name");
  console.log(`Filtered result count: ${filtered.data?.count || 0}`);
  if (filtered.data?.values?.length > 0) {
    for (const p of filtered.data.values) {
      console.log(`  number=${p.number} (type: ${typeof p.number}), id=${p.id}`);
    }
  }

  console.log("\n=== 3. Test POST /product/list with existing number ===");
  // Try to create a product with a number that already exists (if 9796 exists)
  const existingNum = products.find((p: any) => String(p.number) === "9796");
  if (existingNum) {
    console.log(`Product 9796 already exists (id=${existingNum.id}). Testing POST /product/list with same number...`);
    const dupRes = await api("POST", "/product/list", [
      { name: "Test Duplicate", number: 9796 }
    ]);
    console.log("Response:", JSON.stringify(dupRes.data, null, 2));
  } else {
    console.log("Product 9796 does NOT exist in sandbox.");
    // Create it to test
    const createRes = await api("POST", "/product/list", [
      { name: "Analysis Report", number: 9796 },
      { name: "Maintenance", number: 2145 },
    ]);
    console.log("Created:", JSON.stringify(createRes.data?.values?.map((p: any) => ({id: p.id, number: p.number, name: p.name})), null, 2));

    // Now try duplicate
    console.log("\nTrying POST /product/list with now-existing number 9796...");
    const dupRes = await api("POST", "/product/list", [
      { name: "Duplicate Test", number: 9796 }
    ]);
    console.log("Duplicate response:", JSON.stringify(dupRes.data, null, 2));
  }

  console.log("\n=== 4. Test vatType number types ===");
  const vatRes = await api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*&count=10");
  const vatTypes = vatRes.data?.values || [];
  for (const v of vatTypes) {
    console.log(`  code=${v.number} (type: ${typeof v.number}), percentage=${v.percentage}, id=${v.id}, name=${v.name}`);
  }
}

main().catch(e => console.error(e));
