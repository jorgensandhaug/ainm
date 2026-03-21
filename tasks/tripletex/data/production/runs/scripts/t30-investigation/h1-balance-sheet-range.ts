// Hypothesis 1: Balance sheet range wrong
// Standard uses accountNumberFrom=3000&accountNumberTo=8700
// But Norsk Kontoplan has accounts 8701-8999 that might have balances.
// If they differ, the tax calculation using 3000-8700 would be wrong.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (res.status >= 400) {
    console.error(`GET ${path} → ${res.status}`, JSON.stringify(data).slice(0, 500));
    return null;
  }
  return data;
}

async function main() {
  // Test 1a: Standard range 3000-8700
  console.log("=== Balance Sheet: accountNumberFrom=3000, accountNumberTo=8700 ===");
  const bs1 = await api("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8700&fields=*,account(id,number,name)&count=1000");
  if (!bs1) return;

  let sum1 = 0;
  const accounts1: number[] = [];
  for (const row of (bs1.values || [])) {
    sum1 += row.balanceOut || 0;
    accounts1.push(row.account?.number);
  }
  console.log(`Count: ${bs1.values?.length}, Sum balanceOut: ${sum1}`);
  console.log(`Account numbers: ${accounts1.sort((a: number, b: number) => a - b).join(", ")}`);

  // Test 1b: Extended range 3000-8999
  console.log("\n=== Balance Sheet: accountNumberFrom=3000, accountNumberTo=8999 ===");
  const bs2 = await api("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8999&fields=*,account(id,number,name)&count=1000");
  if (!bs2) return;

  let sum2 = 0;
  const accounts2: number[] = [];
  for (const row of (bs2.values || [])) {
    sum2 += row.balanceOut || 0;
    accounts2.push(row.account?.number);
  }
  console.log(`Count: ${bs2.values?.length}, Sum balanceOut: ${sum2}`);
  console.log(`Account numbers: ${accounts2.sort((a: number, b: number) => a - b).join(", ")}`);

  // Test 1c: Only 8701-8999 range (the diff)
  console.log("\n=== Balance Sheet: accountNumberFrom=8701, accountNumberTo=8999 ===");
  const bs3 = await api("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8701&accountNumberTo=8999&fields=*,account(id,number,name)&count=1000");
  if (!bs3) return;

  let sum3 = 0;
  for (const row of (bs3.values || [])) {
    sum3 += row.balanceOut || 0;
    console.log(`  Account ${row.account?.number} (${row.account?.name}): balanceOut=${row.balanceOut}, balanceIn=${row.balanceIn}, balanceChange=${row.balanceChange}`);
  }
  console.log(`Count: ${bs3.values?.length}, Sum balanceOut: ${sum3}`);

  // Test 1d: Also check accounts in range 8700-8700 specifically
  console.log("\n=== Balance Sheet: accountNumberFrom=8700, accountNumberTo=8700 (just 8700) ===");
  const bs4 = await api("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8700&accountNumberTo=8700&fields=*,account(id,number,name)&count=1000");
  if (!bs4) return;
  for (const row of (bs4.values || [])) {
    console.log(`  Account ${row.account?.number} (${row.account?.name}): balanceOut=${row.balanceOut}`);
  }
  console.log(`Count: ${bs4.values?.length}`);

  // Summary
  console.log("\n=== SUMMARY ===");
  console.log(`Sum 3000-8700: ${sum1}`);
  console.log(`Sum 3000-8999: ${sum2}`);
  console.log(`Difference: ${sum2 - sum1}`);
  console.log(`If different, tax calculation would be wrong!`);

  // Also test: what if accountNumberTo is EXCLUSIVE?
  // The trusted standard says "accountNumberTo is INCLUSIVE" but the playbook says "accountNumberTo is exclusive"
  // This is a discrepancy. Let's test.
  console.log("\n=== Test: Is accountNumberTo INCLUSIVE or EXCLUSIVE? ===");
  console.log("=== Balance Sheet: accountNumberFrom=3000, accountNumberTo=8699 ===");
  const bs5 = await api("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8699&fields=*,account(id,number,name)&count=1000");
  if (!bs5) return;
  let sum5 = 0;
  const accounts5: number[] = [];
  for (const row of (bs5.values || [])) {
    sum5 += row.balanceOut || 0;
    accounts5.push(row.account?.number);
  }
  console.log(`Count: ${bs5.values?.length}, Sum balanceOut: ${sum5}`);
  const has8700in5 = accounts5.includes(8700);
  console.log(`Range 3000-8699 includes account 8700? ${has8700in5}`);
  console.log(`Range 3000-8700 includes account 8700? ${accounts1.includes(8700)}`);
  if (sum1 !== sum5) {
    console.log(`DIFFERENCE: 3000-8700 sum = ${sum1}, 3000-8699 sum = ${sum5}, diff = ${sum1 - sum5}`);
    console.log("This confirms accountNumberTo is INCLUSIVE!");
  } else {
    console.log("Sums are equal — accountNumberTo might be EXCLUSIVE or 8700 has no balance");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
