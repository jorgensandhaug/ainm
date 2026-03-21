// Sandbox verification: check account 1700 name and existing accounts, verify flow
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) console.error("  ERROR:", JSON.stringify(data).slice(0, 500));
  return { status: res.status, data, ok: res.ok };
}

async function main() {
  // 1. Check all relevant accounts
  console.log("=== ACCOUNT LOOKUP ===");
  const acctRes = await api("GET", "/ledger/account?number=1209,1700,2920,6010,6300,7500,8700&fields=id,number,name&count=100");
  if (acctRes.ok) {
    for (const a of acctRes.data.values || []) {
      console.log(`  Account ${a.number}: "${a.name}" (id=${a.id})`);
    }
  }

  // 2. Check what accounts exist in range 1200-1250
  console.log("\n=== ASSET ACCOUNTS RANGE 1200-1250 ===");
  const assetRes = await api("GET", "/ledger/account?numberFrom=1200&numberTo=1250&fields=id,number,name&count=100");
  if (assetRes.ok) {
    for (const a of assetRes.data.values || []) {
      console.log(`  Account ${a.number}: "${a.name}" (id=${a.id})`);
    }
  }

  // 3. Check balance sheet to understand structure
  console.log("\n=== BALANCE SHEET (result accounts 3000-8700) ===");
  const bs = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8700&fields=*,account(id,number,name)&count=1000");
  if (bs.ok) {
    let sum = 0;
    for (const row of bs.data.values || []) {
      if (row.balanceOut !== 0) {
        console.log(`  ${row.account?.number} ${row.account?.name}: balanceIn=${row.balanceIn}, balanceOut=${row.balanceOut}`);
      }
      sum += row.balanceOut || 0;
    }
    console.log(`\n  Sum balanceOut: ${sum}`);
    console.log(`  preTaxProfit: ${-sum}`);
    console.log(`  taxAmount (22%): ${Math.round(Math.max(0, -sum) * 0.22)}`);
  }

  // 4. Investigate: what if we try posting voucher with account number instead of id?
  console.log("\n=== TEST: voucher with account number, no id ===");
  const testRes = await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "Test voucher with account number",
    postings: [
      { row: 1, account: { number: 6010 }, amountGross: 1, amountGrossCurrency: 1, description: "test" },
      { row: 2, account: { number: 1209 }, amountGross: -1, amountGrossCurrency: -1, description: "test" },
    ],
  });

  console.log("\nDone.");
}

main().catch(e => console.error("FATAL:", e));
