// Test whether accountNumberTo is inclusive or exclusive
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
  // Account 6010 has a balance in the sandbox. Test if accountNumberTo=6010 includes it.
  console.log("=== accountNumberTo inclusivity test ===");

  // Range 6009-6010: if exclusive, 6010 NOT included. If inclusive, 6010 IS included.
  const bs1 = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=6009&accountNumberTo=6010&fields=*,account(id,number,name)&count=100");
  console.log("Range 6009-6010:");
  for (const row of (bs1.values || [])) {
    console.log(`  account ${row.account?.number} "${row.account?.name}" balanceOut=${row.balanceOut}`);
  }
  console.log(`  Count: ${(bs1.values || []).length}`);

  // Range 6009-6011: should definitely include 6010
  const bs2 = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=6009&accountNumberTo=6011&fields=*,account(id,number,name)&count=100");
  console.log("Range 6009-6011:");
  for (const row of (bs2.values || [])) {
    console.log(`  account ${row.account?.number} "${row.account?.name}" balanceOut=${row.balanceOut}`);
  }
  console.log(`  Count: ${(bs2.values || []).length}`);

  // Range 6010-6010: same start and end
  const bs3 = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=6010&accountNumberTo=6010&fields=*,account(id,number,name)&count=100");
  console.log("Range 6010-6010:");
  for (const row of (bs3.values || [])) {
    console.log(`  account ${row.account?.number} "${row.account?.name}" balanceOut=${row.balanceOut}`);
  }
  console.log(`  Count: ${(bs3.values || []).length}`);

  // Range 6010-6011:
  const bs4 = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=6010&accountNumberTo=6011&fields=*,account(id,number,name)&count=100");
  console.log("Range 6010-6011:");
  for (const row of (bs4.values || [])) {
    console.log(`  account ${row.account?.number} "${row.account?.name}" balanceOut=${row.balanceOut}`);
  }
  console.log(`  Count: ${(bs4.values || []).length}`);

  // Also check: 6300 range to test with the prepaid contra account
  const bs5 = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=6300&accountNumberTo=6300&fields=*,account(id,number,name)&count=100");
  console.log("Range 6300-6300:");
  for (const row of (bs5.values || [])) {
    console.log(`  account ${row.account?.number} "${row.account?.name}" balanceOut=${row.balanceOut}`);
  }
  console.log(`  Count: ${(bs5.values || []).length}`);

  // Check full result accounts 3000-9999
  console.log("\n=== Full result accounts ===");
  const bsFull = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=9999&fields=*,account(id,number,name)&count=1000");
  for (const row of (bsFull.values || [])) {
    if (row.balanceOut !== 0) {
      console.log(`  account ${row.account?.number} "${row.account?.name}" balanceOut=${row.balanceOut}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
