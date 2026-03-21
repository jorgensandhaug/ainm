// Sandbox investigation: check balance sheet behavior and test different tax approaches
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (res.status >= 400) {
    console.error("ERROR:", JSON.stringify(data).slice(0, 800));
  }
  return { status: res.status, data };
}

async function main() {
  // 1. Check what accounts exist and their names
  console.log("=== ACCOUNT CHECK ===");
  const accts = await api("GET", "/ledger/account?number=1200,1209,1240,1250,1700,2050,2920,6010,6300,8700,8960,8990&fields=id,number,name&count=50");
  const acctMap: Record<number, any> = {};
  for (const a of (accts.data.values || [])) {
    acctMap[a.number] = a;
    console.log(`  Account ${a.number}: "${a.name}" (id: ${a.id})`);
  }

  // 2. Check balance sheet for 2025 with different ranges
  console.log("\n=== BALANCE SHEET TESTS ===");

  // Test range: 3000-8700 (exclusive) - what the trusted standard says
  const bs1 = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8700&fields=*,account(id,number,name)&count=1000");
  let sum1 = 0;
  for (const row of (bs1.data.values || [])) {
    sum1 += row.balanceOut || 0;
    if (row.balanceOut !== 0) {
      console.log(`  BS[3000-8700): account ${row.account?.number} "${row.account?.name}" balanceOut=${row.balanceOut}`);
    }
  }
  console.log(`  Total (3000-8700 excl): ${sum1}, preTaxProfit: ${-sum1}`);

  // Test range: 3000-8701 (would include 8700 if exclusive)
  const bs2 = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8701&fields=*,account(id,number,name)&count=1000");
  let sum2 = 0;
  for (const row of (bs2.data.values || [])) {
    sum2 += row.balanceOut || 0;
  }
  console.log(`  Total (3000-8701 excl): ${sum2}`);

  // Test range: 3000-8999 (all result accounts)
  const bs3 = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8999&fields=*,account(id,number,name)&count=1000");
  let sum3 = 0;
  for (const row of (bs3.data.values || [])) {
    sum3 += row.balanceOut || 0;
    if (row.account?.number >= 8700 && row.balanceOut !== 0) {
      console.log(`  BS[3000-8999): HIGH account ${row.account?.number} "${row.account?.name}" balanceOut=${row.balanceOut}`);
    }
  }
  console.log(`  Total (3000-8999): ${sum3}`);

  // 3. Check if accountNumberTo is inclusive or exclusive
  // Create a test: look for accounts around the boundary
  console.log("\n=== BOUNDARY TEST ===");
  const bsBoundary = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8699&accountNumberTo=8701&fields=*,account(id,number,name)&count=100");
  for (const row of (bsBoundary.data.values || [])) {
    console.log(`  Boundary: account ${row.account?.number} "${row.account?.name}" balanceOut=${row.balanceOut}`);
  }

  // 4. Check if result/profit endpoint exists
  console.log("\n=== RESULT ENDPOINT TEST ===");
  const resultTest = await api("GET", "/resultBudget?dateFrom=2025-01-01&dateTo=2026-01-01&fields=*&count=10");

  // 5. Check voucher type for year-end
  console.log("\n=== VOUCHER TYPE TEST ===");
  const voucherTypes = await api("GET", "/ledger/voucherType?fields=id,name&count=100");
  for (const vt of (voucherTypes.data.values || [])) {
    console.log(`  VoucherType: "${vt.name}" (id: ${vt.id})`);
  }

  // 6. Try posting a test voucher with explicit voucherType (YS = Årsoppgjør)
  // First find if there's a year-end voucher type
  let ysTypeId: number | null = null;
  for (const vt of (voucherTypes.data.values || [])) {
    if (vt.name && (vt.name.includes("rsoppgjør") || vt.name.includes("ÅS") || vt.name === "YS" || vt.name.toLowerCase().includes("year"))) {
      ysTypeId = vt.id;
      console.log(`  Found year-end voucher type: "${vt.name}" (id: ${vt.id})`);
    }
  }

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error(e); process.exit(1); });
