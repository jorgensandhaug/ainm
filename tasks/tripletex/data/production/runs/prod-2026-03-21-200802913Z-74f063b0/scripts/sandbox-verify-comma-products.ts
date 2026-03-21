const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(BASE + path, { headers: H });
  const body = await r.json();
  console.log(`GET ${path} -> ${r.status}`);
  if (!r.ok) { console.log("  Error:", JSON.stringify(body)); return null; }
  return body;
}

async function main() {
  // 1. Check what products exist in sandbox
  const catalog = await get("/product?count=100&fields=*");
  if (!catalog) return;
  console.log("\nProducts in catalog:", catalog.count);
  for (const p of catalog.values || []) {
    console.log(`  #${p.number} id=${p.id} "${p.name}" vatType.id=${p.vatType?.id}`);
  }

  // 2. Pick 3 product numbers to test comma-separated query
  const nums = (catalog.values || []).slice(0, 3).map((p: any) => p.number);
  if (nums.length < 3) {
    console.log("Not enough products, need at least 3");
    return;
  }
  console.log("\nTesting comma-separated query with numbers:", nums.join(","));
  const commaResult = await get(`/product?number=${nums.join(",")}&fields=*`);
  if (commaResult) {
    console.log("  Returned count:", commaResult.count);
    for (const p of commaResult.values || []) {
      console.log(`  #${p.number} id=${p.id} "${p.name}" vatType.id=${p.vatType?.id}`);
    }
  }

  // 3. Check customers
  const custResp = await get("/customer?count=5&fields=*");
  if (custResp) {
    console.log("\nCustomers:", custResp.count);
    for (const c of (custResp.values || []).slice(0, 5)) {
      console.log(`  id=${c.id} "${c.name}" org=${c.organizationNumber}`);
    }
  }

  // 4. Check VAT types
  const vatResp = await get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*");
  if (vatResp) {
    console.log("\nOutgoing VAT types:");
    for (const v of vatResp.values || []) {
      console.log(`  id=${v.id} code=${v.number} "${v.name}" ${v.percentage}%`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
