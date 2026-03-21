const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Authorization": AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}/${path}`;
  console.log(`GET ${url}`);
  const r = await fetch(url, { headers: H });
  const body = await r.text();
  console.log(`  -> ${r.status}`);
  if (!r.ok) { console.log(body); throw new Error(`GET ${path} failed: ${r.status}`); }
  return JSON.parse(body);
}

async function main() {
  // Step 1: Check what products exist
  const prodRes = await get("product?count=100&fields=*");
  const products = prodRes.values;
  console.log(`\nProducts in sandbox (${products.length}):`);
  for (const p of products) {
    console.log(`  id=${p.id} number=${p.number} name="${p.name}" vatType.id=${p.vatType?.id}`);
  }

  // Step 2: Try comma-separated number query with first 3 products
  if (products.length >= 3) {
    const nums = products.slice(0, 3).map((p: any) => p.number);
    console.log(`\nTrying comma-separated query: number=${nums.join(",")}`);
    const commaRes = await get(`product?number=${nums.join(",")}&fields=*`);
    console.log(`  Returned ${commaRes.values.length} products`);
    for (const p of commaRes.values) {
      console.log(`  id=${p.id} number=${p.number} name="${p.name}" vatType.id=${p.vatType?.id}`);
    }
  }

  // Step 3: Check available customers
  const custRes = await get("customer?count=5&fields=*");
  console.log(`\nCustomers in sandbox (${custRes.values.length}):`);
  for (const c of custRes.values) {
    console.log(`  id=${c.id} name="${c.name}" orgNumber=${c.organizationNumber}`);
  }

  // Step 4: Check outgoing VAT types
  const vatRes = await get("ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*");
  console.log(`\nOutgoing VAT types:`);
  for (const v of vatRes.values) {
    console.log(`  id=${v.id} number=${v.number} percentage=${v.percentage}%`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
