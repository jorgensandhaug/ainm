const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } });
  const data = await res.json();
  console.log(`${method} ${path} → ${res.status} (${data.values?.length || 0} items)`);
  return data;
}

// Get accounts starting with 8
const accts = await api("GET", "/ledger/account?number=8000,8010,8020,8040,8050,8060,8070,8080,8099,8100,8110,8120,8130,8140,8150,8160,8170,8300,8320,8500,8600,8700,8800,8960,2500,2920&fields=id,number,name,type&count=200");
for (const a of accts.values || []) {
  console.log(`  ${a.number} ${a.name} type=${a.type}`);
}

// Also check the balance sheet for the broader range including 8300+
console.log("\n=== Balance sheet 8000-8999 ===");
const bs = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8000&accountNumberTo=8999&fields=*,account(id,number,name)&count=100");
for (const row of (bs.values || [])) {
  if (row.balanceOut !== 0) {
    console.log(`  ${row.account?.number} ${row.account?.name}: balanceOut=${row.balanceOut}`);
  }
}

// Check what a freshly created 8700 account looks like
console.log("\n=== Account 8700 check ===");
const a8700 = await api("GET", "/ledger/account?number=8700&fields=id,number,name,type&count=1");
if (a8700.values?.length > 0) {
  console.log("Account 8700 exists:", JSON.stringify(a8700.values[0]));
} else {
  console.log("Account 8700 does NOT exist in default chart");
}

// Check what 8300 looks like
const a8300 = await api("GET", "/ledger/account?number=8300&fields=id,number,name,type&count=1");
if (a8300.values?.length > 0) {
  console.log("Account 8300 exists:", JSON.stringify(a8300.values[0]));
}
