// 206: Resolve account IDs from balance sheet to account numbers
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + Buffer.from(`0:${TOKEN}`).toString("base64");
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  return r.json();
}

async function main() {
  // Get balance sheet 8000-8999 with account details
  console.log("=== BALANCE SHEET 8000-8999 with account details ===");
  const bs8 = await get("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8000&accountNumberTo=8999&fields=*,account(*)");
  for (const v of bs8.values) {
    console.log(`  Account ${v.account.number} "${v.account.name}" => balanceChange=${v.balanceChange}, balanceOut=${v.balanceOut}`);
  }

  // Get balance sheet 2000-2999 with account details
  console.log("\n=== BALANCE SHEET 2000-2999 with account details ===");
  const bs2 = await get("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=2000&accountNumberTo=2999&fields=*,account(*)");
  for (const v of bs2.values) {
    console.log(`  Account ${v.account.number} "${v.account.name}" => balanceChange=${v.balanceChange}, balanceOut=${v.balanceOut}`);
  }

  // Specifically get account 8300 and 8700
  console.log("\n=== ACCOUNT 8300 DETAILS ===");
  const accts8300 = await get("/ledger/account?number=8300&fields=*");
  console.log(JSON.stringify(accts8300, null, 2));

  console.log("\n=== ACCOUNT 8700 DETAILS ===");
  const accts8700 = await get("/ledger/account?number=8700&fields=*");
  console.log(JSON.stringify(accts8700, null, 2));

  // Now the key question: what does yearEnd.taxCost pull from?
  // The yearEnd response already showed taxCost grouping: "8300-8319,8600-8619"
  // Let's check if posting to 8300 vs 8700 matters by looking at what's actually ON 8300
  console.log("\n=== BALANCE SHEET 8300-8319 (taxCost grouping range 1) ===");
  const bs83 = await get("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8300&accountNumberTo=8319&fields=*,account(*)");
  for (const v of bs83.values) {
    console.log(`  Account ${v.account.number} "${v.account.name}" => balanceChange=${v.balanceChange}`);
  }

  console.log("\n=== BALANCE SHEET 8600-8619 (taxCost grouping range 2) ===");
  const bs86 = await get("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8600&accountNumberTo=8619&fields=*,account(*)");
  for (const v of bs86.values) {
    console.log(`  Account ${v.account.number} "${v.account.name}" => balanceChange=${v.balanceChange}`);
  }

  // Check if 8700 is in any yearEnd grouping range
  console.log("\n=== BALANCE SHEET 8700-8799 ===");
  const bs87 = await get("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8700&accountNumberTo=8799&fields=*,account(*)");
  for (const v of bs87.values) {
    console.log(`  Account ${v.account.number} "${v.account.name}" => balanceChange=${v.balanceChange}`);
  }

  // Check 8800-8899 and 8900-8999 (disposition / year-end results)
  console.log("\n=== BALANCE SHEET 8800-8999 ===");
  const bs89 = await get("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8800&accountNumberTo=8999&fields=*,account(*)");
  for (const v of bs89.values) {
    console.log(`  Account ${v.account.number} "${v.account.name}" => balanceChange=${v.balanceChange}`);
  }

  // Crucial: Look at yearEnd.annualResult and related computed fields
  console.log("\n=== YEAR END SUMMARY ===");
  const ye = await get("/yearEnd?year=2025&fields=*");
  const v = ye.value;
  console.log(`  status: ${v.status}`);
  console.log(`  annualResult: ${v.annualResult}`);
  console.log(`  operatingRevenue.sumAmount: ${v.operatingRevenue?.sumAmount}`);
  console.log(`  operatingExpense.sumAmount: ${v.operatingExpense?.sumAmount}`);
  console.log(`  capitalIncome: ${JSON.stringify(v.capitalIncome)}`);
  console.log(`  capitalCost: ${JSON.stringify(v.capitalCost)}`);
  console.log(`  extraordinaryCost: ${JSON.stringify(v.extraordinaryCost)}`);
  console.log(`  taxCost.sumAmount: ${v.taxCost?.sumAmount}`);
  console.log(`  taxCost.posts:`);
  for (const p of v.taxCost?.posts || []) {
    console.log(`    groupNumber=${p.groupNumber} grouping=${p.grouping} name="${p.name}" sumAmount=${p.sumAmount}`);
  }
  console.log(`  yearEndReportPosting.sumAmount: ${v.yearEndReportPosting?.sumAmount}`);
  console.log(`  yearEndReportPosting.posts: ${JSON.stringify(v.yearEndReportPosting?.posts)}`);

  // Also check: is "transfers" a field? or "netProfitOrLossForTheYear"?
  console.log(`\n  Keys in yearEnd value:`);
  console.log(`  ${Object.keys(v).join(', ')}`);

  // Check the annualResult computation:
  // Operating result = revenue - expense = 10000000 - 5307255 = 4692745
  // Annual result before tax = 4692745 (no capital income/cost/extraordinary)
  // Annual result after tax = 4692745 - 2212518 = 2480227
  // Actual annualResult = 2480228 (close, off by ~1 due to rounding)
  console.log(`\n  === COMPUTATION CHECK ===`);
  const opResult = (v.operatingRevenue?.sumAmount || 0) - (v.operatingExpense?.sumAmount || 0);
  console.log(`  Operating result (revenue - expense): ${opResult}`);
  console.log(`  Tax cost: ${v.taxCost?.sumAmount}`);
  console.log(`  Computed annual result: ${opResult - (v.taxCost?.sumAmount || 0)}`);
  console.log(`  Actual annualResult: ${v.annualResult}`);
  console.log(`  Difference: ${v.annualResult - (opResult - (v.taxCost?.sumAmount || 0))}`);

  // 2500 (tax payable) and 2920
  console.log("\n=== BALANCE SHEET 2500-2509 with account details ===");
  const bs25 = await get("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=2500&accountNumberTo=2509&fields=*,account(*)");
  for (const v of bs25.values) {
    console.log(`  Account ${v.account.number} "${v.account.name}" => balanceChange=${v.balanceChange}`);
  }

  console.log("\n=== BALANCE SHEET 2920-2929 with account details ===");
  const bs29 = await get("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=2920&accountNumberTo=2929&fields=*,account(*)");
  for (const v of bs29.values) {
    console.log(`  Account ${v.account.number} "${v.account.name}" => balanceChange=${v.balanceChange}`);
  }

  // Also check 2050 (disposition)
  console.log("\n=== BALANCE SHEET 2050-2059 with account details ===");
  const bs20 = await get("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=2050&accountNumberTo=2059&fields=*,account(*)");
  for (const v of bs20.values) {
    console.log(`  Account ${v.account.number} "${v.account.name}" => balanceChange=${v.balanceChange}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
