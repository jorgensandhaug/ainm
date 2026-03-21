// Test if nested field expansion works on postings
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  });
  const json = await res.json();
  if (!res.ok) {
    console.error(`${method} ${path} => ${res.status}`);
    return null;
  }
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

// Test 1: Nested field expansion on postings
console.log("=== Test: fields with nested account expansion ===");
const p1 = await api("GET", "/ledger/posting?dateFrom=2025-01-01&dateTo=2026-03-01&fields=id,account(id,number,name),voucher(id,description),amount,amountGross,vatType(id)&count=3");
if (p1 && p1.length > 0) {
  for (const p of p1) {
    console.log(`Posting ${p.id}: account=${JSON.stringify(p.account)} voucher=${JSON.stringify(p.voucher)} amount=${p.amount} gross=${p.amountGross}`);
  }
}

// Test 2: Voucher with postings expanded
console.log("\n=== Test: voucher fields with postings expansion ===");
const v1 = await api("GET", "/ledger/voucher?dateFrom=2025-01-01&dateTo=2026-03-01&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id))&count=2");
if (v1 && v1.length > 0) {
  for (const v of v1) {
    console.log(`Voucher ${v.id} (${v.description}):`);
    if (v.postings) {
      for (const p of v.postings) {
        console.log(`  Post ${p.id}: acct=${JSON.stringify(p.account)} amount=${p.amount} gross=${p.amountGross}`);
      }
    }
  }
}
