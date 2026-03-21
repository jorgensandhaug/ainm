// Test if accountNumberTo is inclusive or exclusive in /balanceSheet
// Also test the full post-then-read approach

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method, headers: H });
  const text = await r.text();
  if (!r.ok) {
    console.log(`${method} ${path} → ${r.status}: ${text.slice(0, 200)}`);
    return { ok: false, data: null };
  }
  return { ok: true, data: JSON.parse(text) };
}

async function main() {
  // Test 1: accountNumberTo inclusive vs exclusive
  console.log("=== Test 1: accountNumberTo behavior ===\n");

  const bs8700 = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8690&accountNumberTo=8710&fields=*,account(id,number,name)&count=100");
  if (bs8700.ok) {
    console.log("Range 8690-8710:");
    for (const row of bs8700.data?.values || []) {
      console.log(`  ${row.account?.number} (${row.account?.name}): balanceOut=${row.balanceOut}`);
    }
  }

  const bs8699 = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8690&accountNumberTo=8699&fields=*,account(id,number,name)&count=100");
  if (bs8699.ok) {
    console.log("\nRange 8690-8699:");
    for (const row of bs8699.data?.values || []) {
      console.log(`  ${row.account?.number} (${row.account?.name}): balanceOut=${row.balanceOut}`);
    }
  }

  const bs8700exact = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8700&accountNumberTo=8700&fields=*,account(id,number,name)&count=100");
  if (bs8700exact.ok) {
    console.log("\nRange 8700-8700:");
    for (const row of bs8700exact.data?.values || []) {
      console.log(`  ${row.account?.number} (${row.account?.name}): balanceOut=${row.balanceOut}`);
    }
  }

  // Test 2: What accounts exist in the 8xxx range?
  console.log("\n\n=== Test 2: All 8xxx accounts with balance ===\n");
  const bs8xxx = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8000&accountNumberTo=9999&fields=*,account(id,number,name)&count=100");
  if (bs8xxx.ok) {
    for (const row of bs8xxx.data?.values || []) {
      console.log(`  ${row.account?.number} (${row.account?.name}): balanceOut=${row.balanceOut}`);
    }
  }

  // Test 3: Full P&L range comparison
  console.log("\n\n=== Test 3: Full P&L range ===\n");
  const bs3000_8700 = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8700&fields=*,account(id,number,name)&count=1000");
  let sum3000_8700 = 0;
  if (bs3000_8700.ok) {
    for (const row of bs3000_8700.data?.values || []) {
      if (row.balanceOut !== 0) {
        console.log(`  ${row.account?.number} (${row.account?.name}): ${row.balanceOut}`);
        sum3000_8700 += row.balanceOut;
      }
    }
    console.log(`\n  Sum (3000-8700): ${sum3000_8700}`);
    console.log(`  Pre-tax profit: ${-sum3000_8700}`);
  }

  // Also try 3000-8699 for comparison
  const bs3000_8699 = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8699&fields=*,account(id,number,name)&count=1000");
  let sum3000_8699 = 0;
  if (bs3000_8699.ok) {
    for (const row of bs3000_8699.data?.values || []) {
      sum3000_8699 += row.balanceOut;
    }
    console.log(`  Sum (3000-8699): ${sum3000_8699}`);
    console.log(`  Same as 3000-8700? ${sum3000_8700 === sum3000_8699 ? 'YES' : 'NO → accountNumberTo is INCLUSIVE!'}`);
  }

  // Test 4: Check what the opening balance looks like
  console.log("\n\n=== Test 4: Opening balance voucher ===\n");
  const obVouchers = await api("GET", "/ledger/voucher?dateFrom=2025-01-01&dateTo=2025-01-02&fields=id,date,description,number,postings(account(id,number,name),amount,amountGross)&count=10");
  if (obVouchers.ok) {
    for (const v of obVouchers.data?.values || []) {
      console.log(`Voucher ${v.id} (${v.date} "${v.description}" #${v.number}):`);
      for (const p of v.postings || []) {
        if (p.account?.number === 1700 || p.amount !== 0) {
          console.log(`  ${p.account?.number} (${p.account?.name}): amount=${p.amount} amountGross=${p.amountGross}`);
        }
      }
    }
  }

  // Test 5: Look for 1700 postings from opening balance
  console.log("\n\n=== Test 5: All postings on 1700 ===\n");
  const p1700 = await api("GET", "/ledger/posting?accountNumberFrom=1700&accountNumberTo=1700&dateFrom=2024-01-01&dateTo=2026-12-31&fields=id,date,amount,description,voucher(id,date,description,number)&count=50");
  if (p1700.ok) {
    for (const p of p1700.data?.values || []) {
      console.log(`  date=${p.date} amount=${p.amount} desc="${p.description}" voucher="${p.voucher?.description}" #${p.voucher?.number}`);
    }
  }

  // Test 6: Check the resultStatement endpoint as alternative to balanceSheet
  console.log("\n\n=== Test 6: Result statement (P&L) endpoint ===\n");
  const rs = await api("GET", "/resultStatement?dateFrom=2025-01-01&dateTo=2026-01-01&fields=*,account(id,number,name)&count=1000");
  if (rs.ok) {
    let rsSum = 0;
    for (const row of rs.data?.values || []) {
      if (row.balanceOut !== 0) {
        console.log(`  ${row.account?.number} (${row.account?.name}): balanceOut=${row.balanceOut}`);
        rsSum += row.balanceOut;
      }
    }
    console.log(`\n  Result statement sum: ${rsSum}`);
    console.log(`  BS sum (3000-8700): ${sum3000_8700}`);
    console.log(`  Match? ${rsSum === sum3000_8700 ? 'YES' : 'NO'}`);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
