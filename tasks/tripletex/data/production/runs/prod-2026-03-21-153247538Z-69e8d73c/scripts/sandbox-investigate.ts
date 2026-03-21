// Sandbox investigation: verify the optimal create-customer-invoice path
// with exact product numbers, mixed VAT (25%/15%/0%)

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE.replace(/\/+$/, "")}${path}`;
  const opts: RequestInit = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} -> ${res.status}`);
  if (res.status >= 400) {
    console.log("ERROR:", JSON.stringify(json, null, 2));
  }
  return { status: res.status, json };
}

async function main() {
  // Step 1: Check available outgoing VAT types
  console.log("=== Step 1: Check available outgoing VAT types ===");
  const vatRes = await api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*");
  if (vatRes.json?.values) {
    for (const v of vatRes.json.values) {
      console.log(`  VAT id=${v.id} number=${v.number} name=${v.name} percentage=${v.percentage}`);
    }
  }

  // Step 2: Check if products with numbers matching common invoice patterns exist
  console.log("\n=== Step 2: Check products (broad catalog) ===");
  const prodRes = await api("GET", "/product?count=100&fields=*");
  if (prodRes.json?.values) {
    console.log(`  Total products: ${prodRes.json.fullResultSize}`);
    for (const p of prodRes.json.values.slice(0, 20)) {
      console.log(`  id=${p.id} number=${p.number} name=${p.name} vatType=${JSON.stringify(p.vatType)}`);
    }
  }

  // Step 3: Check if we can look up products by productNumber
  console.log("\n=== Step 3: Try exact product number lookup ===");
  const exactProd = await api("GET", "/product?productNumber=3957&productNumber=8149&productNumber=8092&fields=*");
  if (exactProd.json?.values) {
    console.log(`  Found ${exactProd.json.values.length} products`);
    for (const p of exactProd.json.values) {
      console.log(`  id=${p.id} number=${p.number} name=${p.name} vatType=${JSON.stringify(p.vatType)}`);
    }
  }

  // Step 4: Check customers
  console.log("\n=== Step 4: Check customer lookup ===");
  const custRes = await api("GET", "/customer?organizationNumber=970844708&fields=*");
  if (custRes.json?.values) {
    console.log(`  Found ${custRes.json.values.length} customers`);
    for (const c of custRes.json.values) {
      console.log(`  id=${c.id} name=${c.name} orgNo=${c.organizationNumber}`);
    }
  }
}

main().catch(console.error);
