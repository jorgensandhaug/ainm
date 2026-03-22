const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) console.error("ERROR:", typeof data === "string" ? data : JSON.stringify(data).slice(0, 500));
  return { ok: res.ok, status: res.status, data };
}

// 1. Check if there's a yearEnd endpoint
console.log("=== Checking yearEnd endpoints ===");
const yearEnd = await api("GET", "/ledger/annualAccount?yearFrom=2025&yearTo=2026&fields=*");
console.log("Annual accounts:", JSON.stringify(yearEnd.data, null, 2).slice(0, 2000));

// 2. Check the asset register
console.log("\n=== Checking asset register ===");
const assets = await api("GET", "/asset?fields=id,name,acquisitionCost,lifetime,status,account(id,number),depreciationAccount(id,number),depreciationMethod,accumulatedDepreciation,annualDepreciation,depreciationAmount&count=100");
console.log("Assets:", JSON.stringify(assets.data, null, 2).slice(0, 3000));

// 3. Check account 1700 details
console.log("\n=== Checking account 1700 ===");
const acct1700 = await api("GET", "/ledger/account?number=1700&fields=id,number,name,type");
console.log("Account 1700:", JSON.stringify(acct1700.data));

// 4. Check existing vouchers on 2025-12-31
console.log("\n=== Checking year-end vouchers ===");
const vouchers = await api("GET", "/ledger/voucher?dateFrom=2025-12-31&dateTo=2025-12-31&fields=id,description,date&count=100");
console.log("Vouchers count:", vouchers.data?.values?.length || 0);
for (const v of (vouchers.data?.values || []).slice(0, 10)) {
  console.log(`  Voucher ${v.id}: ${v.description}`);
}

// 5. Check balance sheet
console.log("\n=== Balance sheet 3000-8299 ===");
const bs = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8299&fields=*,account(id,number,name)&count=1000");
let sum = 0;
for (const row of (bs.data?.values || [])) {
  if (row.balanceOut !== 0) {
    console.log(`  ${row.account?.number} ${row.account?.name}: balanceOut=${row.balanceOut}`);
  }
  sum += row.balanceOut || 0;
}
console.log(`  SUM balanceOut: ${sum}, preTaxProfit: ${-sum}`);

// 6. Check all accounts in tax-relevant range
console.log("\n=== Accounts 8000-8999 ===");
const taxAccts = await api("GET", "/ledger/account?numberFrom=8000&numberTo=8999&fields=id,number,name,type&count=100");
for (const a of (taxAccts.data?.values || [])) {
  console.log(`  ${a.number} ${a.name} type=${a.type}`);
}

// 7. Check accounts 2500 and 2920
console.log("\n=== Accounts 2500 and 2920 ===");
const taxLiabAccts = await api("GET", "/ledger/account?number=2500,2920&fields=id,number,name,type&count=10");
for (const a of (taxLiabAccts.data?.values || [])) {
  console.log(`  ${a.number} ${a.name} type=${a.type}`);
}
