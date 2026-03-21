// Can we filter accounting period precisely instead of fetching all?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  if (!r.ok) { const t = await r.text(); console.error(`GET ${path} → ${r.status}: ${t}`); return null; }
  return r.json();
}

async function main() {
  // For last CSV date 2026-02-08, the period starts at 2026-02-01
  // Can we query for exactly that period?
  const res = await get("/ledger/accountingPeriod?startFrom=2026-02-01&startTo=2026-02-02&count=1&fields=*");
  console.log("Filtered period query result:", JSON.stringify(res?.values, null, 2));

  // Also test: what about using CSV saldo vs balance sheet?
  // In production fresh accounts, the opening balance is set to match CSV
  // So the final Saldo in CSV should equal the account balance

  // Check: can we use balanceSheet with a broader range?
  const bal = await get("/balanceSheet?dateFrom=2026-01-01&dateTo=2026-02-28&accountNumberFrom=1920&accountNumberTo=1920&count=1&fields=*");
  console.log("\nBalance 1920 (Jan-Feb):", JSON.stringify(bal?.values?.[0], null, 2));

  // Also check Jan period specifically
  const balJan = await get("/balanceSheet?dateFrom=2026-01-01&dateTo=2026-01-31&accountNumberFrom=1920&accountNumberTo=1920&count=1&fields=*");
  console.log("\nBalance 1920 (Jan only):", JSON.stringify(balJan?.values?.[0], null, 2));

  // And Feb specifically
  const balFeb = await get("/balanceSheet?dateFrom=2026-02-01&dateTo=2026-02-28&accountNumberFrom=1920&accountNumberTo=1920&count=1&fields=*");
  console.log("\nBalance 1920 (Feb only):", JSON.stringify(balFeb?.values?.[0], null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
