// Deep investigation: What if the tax calculation range is wrong?
// The standard uses 3000-8700 for balanceSheet to compute taxable profit.
// But this INCLUDES account 8700 (the tax expense account itself).
//
// In production, we POST depreciation+prepaid FIRST, then read the balance sheet.
// At BS-read time, account 8700 has been just created (no postings yet).
// So it should show 0 balance for 8700.
//
// But what if the right range is actually different?
// Norwegian tax calculation uses: Revenue (3000-3999) - Expenses (4000-7999) = Operating result
// Then financial income/expense (8000-8499) gives pre-tax result
// Accounts 8700+ are tax-related and should NOT be in the taxable base.
//
// Let's check: is accountNumberTo INCLUSIVE? If 8700 is inclusive and has a balance,
// the tax calculation is self-referential and wrong.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  });
  const data = await res.json();
  console.log(`GET ${path.slice(0, 100)}... → ${res.status}`);
  if (res.status >= 400) {
    console.error("ERROR:", JSON.stringify(data).slice(0, 500));
    return null;
  }
  return data;
}

async function main() {
  // Test different ranges and compare

  // Range 1: 3000-8699 (EXCLUDE account 8700)
  console.log("=== Range 3000-8699 (exclude 8700) ===");
  const bs1 = await api("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8699&fields=*,account(number,name)&count=1000");
  if (!bs1) return;
  let sum1 = 0;
  for (const row of (bs1.values || [])) {
    sum1 += row.balanceOut || 0;
    console.log(`  ${row.account?.number} (${row.account?.name}): balanceOut=${row.balanceOut}`);
  }
  console.log(`Sum 3000-8699: ${sum1}, preTaxProfit = ${-sum1}`);

  // Range 2: 3000-8700 (INCLUDE account 8700 — current standard)
  console.log("\n=== Range 3000-8700 (include 8700) ===");
  const bs2 = await api("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8700&fields=*,account(number,name)&count=1000");
  if (!bs2) return;
  let sum2 = 0;
  for (const row of (bs2.values || [])) {
    sum2 += row.balanceOut || 0;
    console.log(`  ${row.account?.number} (${row.account?.name}): balanceOut=${row.balanceOut}`);
  }
  console.log(`Sum 3000-8700: ${sum2}, preTaxProfit = ${-sum2}`);

  // Range 3: 3000-7999 (standard Norwegian result range)
  console.log("\n=== Range 3000-7999 (standard P&L) ===");
  const bs3 = await api("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=7999&fields=*,account(number,name)&count=1000");
  if (!bs3) return;
  let sum3 = 0;
  for (const row of (bs3.values || [])) {
    sum3 += row.balanceOut || 0;
  }
  console.log(`Sum 3000-7999: ${sum3}, preTaxProfit = ${-sum3}`);

  // Range 4: 3000-8599 (up to but not including financial items > 8599)
  console.log("\n=== Range 3000-8599 ===");
  const bs4 = await api("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8599&fields=*,account(number,name)&count=1000");
  if (!bs4) return;
  let sum4 = 0;
  for (const row of (bs4.values || [])) {
    sum4 += row.balanceOut || 0;
  }
  console.log(`Sum 3000-8599: ${sum4}, preTaxProfit = ${-sum4}`);

  // Now compare
  console.log("\n=== COMPARISON ===");
  console.log(`3000-7999: sum=${sum3}, profit=${-sum3}`);
  console.log(`3000-8599: sum=${sum4}, profit=${-sum4}`);
  console.log(`3000-8699: sum=${sum1}, profit=${-sum1}`);
  console.log(`3000-8700: sum=${sum2}, profit=${-sum2}`);
  console.log(`Diff 8699 vs 8700: ${sum2 - sum1} (= account 8700 balance)`);

  // In production, account 8700 is freshly created with no postings.
  // So in production 3000-8699 and 3000-8700 give the same sum.
  // The question is: should the range INCLUDE financial income/expense (8000-8499)?
  // Norwegian tax: taxable profit = total income - total expenses including financial items
  // So 3000-8699 should be correct (all income and expense accounts before tax)

  // But what if the right range to use is something else entirely?
  // The resultSheet endpoint might tell us what Tripletex thinks the result is
  console.log("\n=== Result Sheet ===");
  const rs = await api("/resultSheet?dateFrom=2025-01-01&dateTo=2026-01-01&fields=*,account(number,name)&count=1000");
  if (rs) {
    let rsSum = 0;
    for (const row of (rs.values || [])) {
      rsSum += row.balanceOut || row.sum || 0;
      if (row.account?.number >= 8000) {
        console.log(`  ${row.account?.number} (${row.account?.name}): sum=${row.sum}, balanceIn=${row.balanceIn}, balanceOut=${row.balanceOut}, balanceChange=${row.balanceChange}`);
      }
    }
    console.log(`ResultSheet total sum: ${rsSum}`);
    console.log(`ResultSheet count: ${rs.values?.length}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
