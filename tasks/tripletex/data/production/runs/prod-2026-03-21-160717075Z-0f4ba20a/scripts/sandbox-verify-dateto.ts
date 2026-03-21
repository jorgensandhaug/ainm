const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const res = await fetch(url, {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  });
  const text = await res.text();
  console.log(`  Status: ${res.status}`);
  if (!res.ok) { console.log(`  Error: ${text}`); return null; }
  const json = JSON.parse(text);
  return json;
}

// Test 1: Get vouchers with dateTo=2026-02-28 - does it include Feb 28 vouchers?
console.log("=== Test 1: dateTo=2026-02-28 ===");
const r1 = await api("GET", "/ledger/voucher?dateFrom=2026-02-28&dateTo=2026-02-28&fields=id,date,description&count=100");
console.log("Vouchers with dateFrom=2026-02-28 & dateTo=2026-02-28:", r1?.fullResultSize, "results");
if (r1?.values) {
  for (const v of r1.values) {
    console.log(`  Voucher ${v.id}: date=${v.date} desc=${v.description}`);
  }
}

console.log("\n=== Test 2: dateTo=2026-03-01 (should include Feb 28 if exclusive) ===");
const r2 = await api("GET", "/ledger/voucher?dateFrom=2026-02-28&dateTo=2026-03-01&fields=id,date,description&count=100");
console.log("Vouchers with dateFrom=2026-02-28 & dateTo=2026-03-01:", r2?.fullResultSize, "results");
if (r2?.values) {
  for (const v of r2.values) {
    console.log(`  Voucher ${v.id}: date=${v.date} desc=${v.description}`);
  }
}

// Also check the full Jan-Feb range with both approaches
console.log("\n=== Test 3: Full range dateTo=2026-02-28 ===");
const r3 = await api("GET", "/ledger/voucher?dateFrom=2026-01-01&dateTo=2026-02-28&fields=id,date&count=1000");
console.log("Total vouchers:", r3?.fullResultSize);
const dates3 = r3?.values?.map((v: any) => v.date).sort();
if (dates3?.length) console.log("Date range:", dates3[0], "to", dates3[dates3.length-1]);

console.log("\n=== Test 4: Full range dateTo=2026-03-01 ===");
const r4 = await api("GET", "/ledger/voucher?dateFrom=2026-01-01&dateTo=2026-03-01&fields=id,date&count=1000");
console.log("Total vouchers:", r4?.fullResultSize);
const dates4 = r4?.values?.map((v: any) => v.date).sort();
if (dates4?.length) console.log("Date range:", dates4[0], "to", dates4[dates4.length-1]);
