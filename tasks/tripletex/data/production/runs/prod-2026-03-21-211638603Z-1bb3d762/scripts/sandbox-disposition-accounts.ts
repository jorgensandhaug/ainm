// Check disposition account variants
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method, headers: { "Authorization": AUTH } });
  const data = await res.json();
  return data;
}

async function main() {
  // Check all possible disposition accounts
  const accts = await api("GET", "/ledger/account?number=2050,2080,2800,8800,8960,8990&fields=id,number,name&count=20");
  console.log("=== Disposition-related accounts ===");
  for (const a of (accts.values || [])) {
    console.log(`  ${a.number}: "${a.name}" (id: ${a.id})`);
  }

  // Also check: what accounts are in the 2000-2099 range?
  const equity = await api("GET", "/ledger/account?numberFrom=2050&numberTo=2099&fields=id,number,name&count=50");
  console.log("\n=== Equity accounts (2050-2099) ===");
  for (const a of (equity.values || [])) {
    console.log(`  ${a.number}: "${a.name}" (id: ${a.id})`);
  }

  // Check 8800-8999 range
  const result = await api("GET", "/ledger/account?numberFrom=8800&numberTo=8999&fields=id,number,name&count=50");
  console.log("\n=== Result disposition accounts (8800-8999) ===");
  for (const a of (result.values || [])) {
    console.log(`  ${a.number}: "${a.name}" (id: ${a.id})`);
  }

  // Check what vouchers exist on these accounts already (sandbox residual)
  console.log("\n=== Balance on disposition accounts ===");
  const bs = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8800&accountNumberTo=8999&fields=*,account(id,number,name)&count=100");
  for (const row of (bs.values || [])) {
    console.log(`  ${row.account?.number}: balanceOut=${row.balanceOut}`);
  }

  // Also check 2050 balance
  const bs2 = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=2050&accountNumberTo=2099&fields=*,account(id,number,name)&count=100");
  for (const row of (bs2.values || [])) {
    console.log(`  ${row.account?.number}: balanceOut=${row.balanceOut}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
