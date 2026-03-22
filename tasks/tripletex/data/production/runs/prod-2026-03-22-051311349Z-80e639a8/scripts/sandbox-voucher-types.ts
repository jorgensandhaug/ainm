const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } });
  const data = await res.json();
  console.log(`${method} ${path} → ${res.status}`);
  return data;
}

// 1. Check voucher types
console.log("=== Voucher Types ===");
const vtRes = await api("GET", "/ledger/voucherType?count=100&fields=id,name,displayName");
for (const vt of vtRes.values || []) {
  console.log(`  id=${vt.id} name="${vt.name}" displayName="${vt.displayName}"`);
}

// 2. Check a depreciation voucher's type
console.log("\n=== Sample voucher from our postings ===");
const vRes = await api("GET", "/ledger/voucher?dateFrom=2025-12-31&dateTo=2026-01-01&fields=id,description,voucherType(id,name)&count=5");
for (const v of (vRes.values || []).slice(0, 5)) {
  console.log(`  id=${v.id} desc="${v.description}" type=${v.voucherType ? `${v.voucherType.id}(${v.voucherType.name})` : 'null'}`);
}

// 3. Check if there's a specific yearEnd voucher type
console.log("\n=== Looking for year-end specific voucher types ===");
for (const vt of vtRes.values || []) {
  const name = (vt.name || '').toLowerCase();
  if (name.includes('år') || name.includes('year') || name.includes('års') || name.includes('memoriald') || name.includes('korreksjons') || name.includes('disposisjon')) {
    console.log(`  MATCH: id=${vt.id} name="${vt.name}" displayName="${vt.displayName}"`);
  }
}

// 4. Check what fields the yearEnd report has for tangibleFixedAssets
console.log("\n=== yearEnd tangibleFixedAssets ===");
const ye = await api("GET", "/yearEnd?year=2025&fields=tangibleFixedAssets");
console.log(JSON.stringify(ye.value?.tangibleFixedAssets, null, 2));
