// Test balance sheet accountNumberTo behavior
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: H });
  const data = await res.json();
  return data;
}

async function main() {
  // Test if accountNumberTo=8700 includes account 8700
  console.log("=== BS with accountNumberTo=8700 ===");
  const bs1 = await api("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8600&accountNumberTo=8700&fields=*,account(id,number,name)&count=100");
  for (const row of bs1.values) {
    console.log(`  ${row.account.number} ${row.account.name}: balOut=${row.balanceOut}`);
  }

  console.log("\n=== BS with accountNumberTo=8701 ===");
  const bs2 = await api("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8600&accountNumberTo=8701&fields=*,account(id,number,name)&count=100");
  for (const row of bs2.values) {
    console.log(`  ${row.account.number} ${row.account.name}: balOut=${row.balanceOut}`);
  }

  console.log("\n=== BS with accountNumberTo=8699 ===");
  const bs3 = await api("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8600&accountNumberTo=8699&fields=*,account(id,number,name)&count=100");
  for (const row of bs3.values) {
    console.log(`  ${row.account.number} ${row.account.name}: balOut=${row.balanceOut}`);
  }

  // Also check: does account 8700 have any balance?
  console.log("\n=== BS specifically for 8700 ===");
  const bs4 = await api("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8700&accountNumberTo=8701&fields=*,account(id,number,name)&count=100");
  for (const row of bs4.values) {
    console.log(`  ${row.account.number} ${row.account.name}: balOut=${row.balanceOut}`);
  }
}

main().catch(console.error);
