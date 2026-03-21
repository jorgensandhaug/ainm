// Sandbox investigation: test product number filtering and resilient flow
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = BASE + path;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json().catch(() => ({}));
  console.log(`${method} ${path} → ${r.status}`);
  return { status: r.status, data: json };
}

async function main() {
  // Test 1: Can GET /product filter by exact number? (already confirmed for 9796)
  console.log("=== Test: GET /product with exact number filter ===");
  const r1 = await api("GET", "/product?number=2145&fields=id,number,name");
  console.log(`count=${r1.data?.count}, values:`, r1.data?.values?.map((p: any) => `${p.number}→id${p.id}`));

  // Test 2: GET /product with a number that does NOT exist
  console.log("\n=== Test: GET /product with non-existent number ===");
  const r2 = await api("GET", "/product?number=99999&fields=id,number,name");
  console.log(`count=${r2.data?.count}, values:`, r2.data?.values);

  // Test 3: The resilient product lookup pattern
  // Look up 3 products: 9796, 2145, and a non-existent one (88888)
  console.log("\n=== Test: Resilient product lookup for mixed existing/non-existing ===");
  const needed = ["9796", "2145", "88888"];
  const prodRes = await api("GET", "/product?fields=id,number&count=1000");
  const allProds = prodRes.data?.values || [];
  const found: Record<string, number> = {};
  const missing: string[] = [];
  for (const num of needed) {
    const match = allProds.find((p: any) => String(p.number) === num);
    if (match) {
      found[num] = match.id;
    } else {
      missing.push(num);
    }
  }
  console.log("Found:", found);
  console.log("Missing:", missing);

  if (missing.length > 0) {
    console.log("\nWould need POST /product/list for:", missing);
  } else {
    console.log("\nAll products exist, no POST needed");
  }

  // Test 4: Correct string comparison for vatType
  console.log("\n=== Test: VatType number string comparison patterns ===");
  const vatRes = await api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=id,number,percentage,name");
  const vatTypes = vatRes.data?.values || [];

  // Wrong way (what the production run did):
  const wrongMatch = vatTypes.find((v: any) => v.percentage === 0 && v.number === 5);
  console.log(`Wrong (=== 5): ${wrongMatch ? 'FOUND' : 'NOT FOUND'}`);

  // Right way:
  const rightMatch1 = vatTypes.find((v: any) => v.percentage === 0 && Number(v.number) === 5);
  console.log(`Right (Number()): ${rightMatch1 ? 'FOUND id=' + rightMatch1.id : 'NOT FOUND'}`);

  const rightMatch2 = vatTypes.find((v: any) => v.percentage === 0 && String(v.number) === "5");
  console.log(`Right (String()): ${rightMatch2 ? 'FOUND id=' + rightMatch2.id : 'NOT FOUND'}`);

  // Loose equality:
  const looseMatch = vatTypes.find((v: any) => v.percentage === 0 && v.number == 5);
  console.log(`Loose (== 5): ${looseMatch ? 'FOUND id=' + looseMatch.id : 'NOT FOUND'}`);
}

main().catch(e => console.error(e));
