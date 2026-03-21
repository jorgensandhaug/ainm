// Task 30: Investigate what checks 4+5 validate in year-end closing
// Hypothesis: checks validate result disposition (årsresultat) or year-end-specific accounts

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json();
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 500));
  return { status: res.status, data: json };
}

async function main() {
  // 1. Check result disposition accounts
  console.log("=== 1. Result disposition accounts ===");
  const resultAccts = await api("GET", "/ledger/account?number=8800,8801,8960,8990,2050,2080,2099,2000&fields=id,number,name");
  for (const a of (resultAccts.data?.values || []).sort((a: any, b: any) => a.number - b.number)) {
    console.log(`  ${a.number} "${a.name}" id=${a.id}`);
  }

  // 2. Check asset accounts that task uses
  console.log("\n=== 2. Asset and depreciation accounts ===");
  const assetAccts = await api("GET", "/ledger/account?number=1200,1209,1210,1230,1240,1250,6010&fields=id,number,name");
  for (const a of (assetAccts.data?.values || []).sort((a: any, b: any) => a.number - b.number)) {
    console.log(`  ${a.number} "${a.name}" id=${a.id}`);
  }

  // 3. Check per-asset accumulated depreciation accounts (might be expected instead of 1209)
  console.log("\n=== 3. Per-asset accumulated depreciation accounts ===");
  const perAssetAccts = await api("GET", "/ledger/account?number=1201,1211,1219,1231,1239,1241,1249,1251,1259&fields=id,number,name");
  for (const a of (perAssetAccts.data?.values || []).sort((a: any, b: any) => a.number - b.number)) {
    console.log(`  ${a.number} "${a.name}" id=${a.id}`);
  }

  // 4. Check account 1700 details
  console.log("\n=== 4. Account 1700 details ===");
  const acct1700 = await api("GET", "/ledger/account?number=1700&fields=*");
  for (const a of (acct1700.data?.values || [])) {
    console.log(`  ${a.number} "${a.name}" id=${a.id}`);
    console.log(`  type=${JSON.stringify(a.type)} vatType=${JSON.stringify(a.vatType)}`);
    console.log(`  Full:`, JSON.stringify(a, null, 2).slice(0, 1000));
  }

  // 5. Check what year-end API endpoints exist
  console.log("\n=== 5. Year-end API endpoints ===");
  const yearEnd1 = await api("GET", "/yearEnd?count=1&fields=*");

  // 6. Check if there's an annual accounts or closing endpoint
  console.log("\n=== 6. Annual accounts/closing endpoints ===");
  const annual1 = await api("GET", "/annualAccounts?count=1&fields=*");
  const close1 = await api("GET", "/resultBudget?count=1&fields=*");

  // 7. Check existing postings on account 1700 (to find historical contra)
  console.log("\n=== 7. Existing postings on account 1700 ===");
  const postings1700 = await api("GET", "/ledger/posting?accountNumber=1700&dateFrom=2024-01-01&dateTo=2026-12-31&fields=*,account(id,number,name)&count=50");
  for (const p of (postings1700.data?.values || []).slice(0, 20)) {
    console.log(`  voucherId=${p.voucher?.id} acct=${p.account?.number} "${p.account?.name}" amount=${p.amount} date=${p.date} desc="${p.description || ''}"`);
  }

  // 8. Let's try the /yearEnd/report or similar
  console.log("\n=== 8. Year-end report APIs ===");
  const ye1 = await api("GET", "/yearEnd/report?year=2025");
  const ye2 = await api("GET", "/yearEnd/annualAccounts?year=2025");
  const ye3 = await api("GET", "/yearEnd?year=2025");

  // 9. Check the depreciation API (if exists)
  console.log("\n=== 9. Depreciation/asset register APIs ===");
  const dep1 = await api("GET", "/asset?count=5&fields=*");
  const dep2 = await api("GET", "/asset/depreciation?count=5&fields=*");

  // 10. Check account 6300 to confirm it's the right prepaid contra
  console.log("\n=== 10. Account 6300 and alternatives ===");
  const acct6300 = await api("GET", "/ledger/account?number=6300,6390,6400,6990,7500&fields=id,number,name");
  for (const a of (acct6300.data?.values || []).sort((a: any, b: any) => a.number - b.number)) {
    console.log(`  ${a.number} "${a.name}" id=${a.id}`);
  }

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
