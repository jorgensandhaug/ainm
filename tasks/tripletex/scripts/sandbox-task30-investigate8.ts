// Task 30 investigation part 2: Focus on what the checker ACTUALLY validates
// Key insight from reading the playbook: "accountNumberTo is exclusive" in the
// trusted standard that the agent READ was WRONG — but the playbook says it's INCLUSIVE.
// However, this doesn't matter because 8700 has 0 balance when the BS is read.
//
// New hypothesis: Maybe the issue is about the ACCOUNT NUMBERS used for depreciation.
// The task says: "conta 1200" for Kontormaskiner, "conta 1240" for Inventar, "conta 1250" for Programvare.
// But ALL depreciation goes to account 6010 (expense) and 1209 (accumulated depreciation).
// What if the checker expects SEPARATE accumulated depreciation accounts per asset?
// e.g., 1201 for Kontormaskiner (1200), 1241 for Inventar (1240), 1251 for Programvare (1250)?
//
// Wait — checks 1-3 PASS. So the depreciation approach is fine.
// The failing checks are 4 (prepaid) and 5 (tax).
//
// NEW critical hypothesis: What if the balance sheet in a fresh prod environment
// has REVENUE accounts (3000-3999) with negative balances, and the tax calculation
// works differently than on this sandbox?
//
// Key question: In a fresh environment, what does the balance sheet look like?
// The sandbox is dirty. Let's see what a CLEAN balance sheet would give.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

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
  if (!res.ok) {
    console.log(`${method} ${path} => ${res.status}: ${JSON.stringify(data).slice(0, 500)}`);
    return { ok: false, status: res.status, data };
  }
  return { ok: true, status: res.status, data };
}

async function main() {
  // =====================================================================
  // EXPERIMENT 1: What does /ledger/closeGroup return?
  // This might be how the checker calculates the "result"
  // =====================================================================
  console.log("=".repeat(70));
  console.log("EXPERIMENT 1: /ledger/closeGroup (result calculation?)");
  console.log("=".repeat(70));

  const cg1 = await api("GET", "/ledger/closeGroup?dateFrom=2025-01-01&dateTo=2026-01-01&fields=*&count=200");
  if (cg1.ok) {
    console.log(`closeGroup entries: ${cg1.data?.values?.length}`);
    for (const cg of cg1.data?.values || []) {
      console.log(`  ${JSON.stringify(cg).slice(0, 200)}`);
    }
  }

  // Try with different date range
  const cg2 = await api("GET", "/ledger/closeGroup?dateFrom=2025-01-01&dateTo=2025-12-31&fields=*&count=200");
  if (cg2.ok) {
    console.log(`\ncloseGroup (2025-12-31): ${cg2.data?.values?.length} entries`);
    for (const cg of cg2.data?.values || []) {
      console.log(`  ${JSON.stringify(cg).slice(0, 200)}`);
    }
  }

  // =====================================================================
  // EXPERIMENT 2: Full balance sheet with ALL accounts to understand the structure
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 2: Full balance sheet - what revenue exists?");
  console.log("=".repeat(70));

  const bsFull = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8999&fields=*,account(id,number,name)&count=5000");
  let totalRevExp = 0;
  console.log("Revenue & expense accounts with non-zero balance:");
  for (const row of bsFull.data?.values || []) {
    if (row.balanceOut !== 0) {
      const num = row.account?.number;
      const cat = num < 4000 ? "REVENUE" : num < 5000 ? "COST_OF_GOODS" : num < 7000 ? "OPERATING_EXP" : num < 8000 ? "PERSONNEL" : "FINANCIAL";
      console.log(`  ${cat} ${num} "${row.account?.name}": balanceIn=${row.balanceIn} change=${row.balanceChange} out=${row.balanceOut}`);
      totalRevExp += row.balanceOut;
    }
  }
  console.log(`  Total: ${totalRevExp}`);

  // =====================================================================
  // EXPERIMENT 3: What if we use /resultBudget or alternative result endpoint?
  // Let me try /ledger/account with specific query patterns
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 3: OpenAPI endpoint discovery");
  console.log("=".repeat(70));

  // Try various endpoints
  const tryEndpoints = [
    "/ledger/posting/openPost?dateFrom=2025-01-01&dateTo=2025-12-31&accountId=424190838&fields=*&count=10",
    "/ledger/account/numberResult?dateFrom=2025-01-01&dateTo=2025-12-31&fields=*",
    "/company?fields=*",
  ];

  for (const ep of tryEndpoints) {
    await api("GET", ep);
  }

  // =====================================================================
  // EXPERIMENT 4: Check the openapi spec for balance-related endpoints
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 4: Check /resultBudget and /annualAccounts from openapi");
  console.log("=".repeat(70));

  // These were 404 before. Let me try some other paths from the Tripletex API
  const moreEndpoints = [
    "/ledger/account?from=0&count=1&number=1700&fields=id,number,name,openingBalance",
    "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=1700&accountNumberTo=1700&fields=*,account(*)",
  ];
  for (const ep of moreEndpoints) {
    const r = await api("GET", ep);
    if (r.ok) console.log("  Result:", JSON.stringify(r.data).slice(0, 500));
  }

  // =====================================================================
  // EXPERIMENT 5: Check what the OPENING BALANCE on account 1700 is
  // In a fresh prod env, 1700 should have a debit balance (prepaid asset)
  // The task says "45900 NOK na conta 1700" — this should be the opening balance
  // We need to reverse it by crediting 1700 and debiting an expense account
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 5: Account 1700 opening balance and history");
  console.log("=".repeat(70));

  // Check the opening balance entry
  const obVouchers = await api("GET", "/ledger/voucher?dateFrom=2025-01-01&dateTo=2025-01-02&voucherTypeId=9744856&fields=id,date,description,voucherType(id,name),postings(id,row,account(id,number,name),amount,amountGross,description)&count=50");
  console.log("Opening balance vouchers:");
  for (const v of obVouchers.data?.values || []) {
    console.log(`\n  Voucher ${v.id} (${v.date}, "${v.description}", type=${v.voucherType?.name}):`);
    for (const p of v.postings || []) {
      if (p.account?.number >= 1700 && p.account?.number <= 1799) {
        console.log(`    row=${p.row} acct=${p.account?.number} "${p.account?.name}" amount=${p.amount} gross=${p.amountGross}`);
      }
    }
  }

  // Also check: is there a balance on 1700 at the START of the year?
  const bs1700Start = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2025-01-02&accountNumberFrom=1700&accountNumberTo=1700&fields=*,account(id,number,name)");
  console.log("\n1700 balance at 2025-01-01:", JSON.stringify(bs1700Start.data?.values?.[0]));

  // What about 2024-12-31?
  const bs1700End2024 = await api("GET", "/balanceSheet?dateFrom=2024-01-01&dateTo=2025-01-01&accountNumberFrom=1700&accountNumberTo=1700&fields=*,account(id,number,name)");
  console.log("1700 balance end 2024:", JSON.stringify(bs1700End2024.data?.values?.[0]));

  // =====================================================================
  // EXPERIMENT 6: What accounts exist in 2920 range?
  // 2920 is "Gjeld til selskap i samme konsern" in this sandbox — that seems wrong!
  // Standard account 2920 should be "Betalbar skatt" or "Skyldig skatt"
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 6: Account 2920 details");
  console.log("=".repeat(70));

  const acct2920 = await api("GET", "/ledger/account?number=2920&fields=*");
  for (const a of acct2920.data?.values || []) {
    console.log(`  2920: "${a.name}" type=${a.type} id=${a.id}`);
    console.log(`  Full: ${JSON.stringify(a).slice(0, 500)}`);
  }

  // Check surrounding accounts
  const accts2900 = await api("GET", "/ledger/account?numberFrom=2900&numberTo=2999&fields=id,number,name&count=50");
  console.log("\nAccounts 2900-2999:");
  for (const a of accts2900.data?.values || []) {
    console.log(`  ${a.number}: "${a.name}" (id=${a.id})`);
  }

  // =====================================================================
  // EXPERIMENT 7: What does the task prompt ACTUALLY expect for check 4 (prepaid)?
  // Maybe the issue is that the prepaid reversal needs to match the OPENING BALANCE
  // amount, not the amount in the task prompt. Or maybe 1700's name maps to a
  // different expense account than 6300.
  // Let me check: what OTHER accounts could be the right contra for "leiekostnad"?
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 7: All possible contra accounts for prepaid lease");
  console.log("=".repeat(70));

  // Search for "leie" in account names
  const allAccts = await api("GET", "/ledger/account?fields=id,number,name&count=3000");
  const leieAccts: any[] = [];
  for (const a of allAccts.data?.values || []) {
    const name = (a.name || "").toLowerCase();
    if (name.includes("leie") || name.includes("husleie") || name.includes("lokale") ||
        name.includes("6300") || name.includes("6395") || name.includes("6340")) {
      leieAccts.push(a);
    }
  }
  console.log("Accounts containing 'leie/husleie/lokale':");
  for (const a of leieAccts) {
    console.log(`  ${a.number}: "${a.name}"`);
  }

  // Also show accounts 6300-6399
  console.log("\nAccounts 6300-6399:");
  for (const a of allAccts.data?.values || []) {
    if (a.number >= 6300 && a.number <= 6399) {
      console.log(`  ${a.number}: "${a.name}"`);
    }
  }

  // =====================================================================
  // EXPERIMENT 8: Test posting a voucher on 1700 with a DIFFERENT expense contra
  // Try 6395 "Leie av andre lokaler" or 6340 "Lys og varme"
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 8: Check if prepaid reversal amount matters");
  console.log("=".repeat(70));

  // The task says "total 45900 NOK na conta 1700"
  // But in the sandbox, 1700 has a much larger balance (accumulated from all tests)
  // In a FRESH production environment, 1700 should have EXACTLY 45900 as opening balance
  // (since that's what the task prompt says)

  // So the reversal should be for exactly 45900 — which is what we do.
  // The question is: what's the right contra account?

  // Let me check if there's a pattern in the opening balance voucher
  // that shows what contra was used to SET UP the 45900 balance
  console.log("Checking all opening balance voucher postings for clues...");
  for (const v of obVouchers.data?.values || []) {
    console.log(`\nOpening Balance Voucher ${v.id}:`);
    let has1700 = false;
    for (const p of v.postings || []) {
      if (p.account?.number === 1700) has1700 = true;
    }
    if (has1700) {
      console.log("  ** Contains 1700 posting! Full postings:");
      for (const p of v.postings || []) {
        console.log(`    row=${p.row} acct=${p.account?.number} "${p.account?.name}" amount=${p.amount}`);
      }
    }
  }

  // =====================================================================
  // EXPERIMENT 9: What if check 4 and check 5 are NOT about prepaid and tax?
  // What if they map differently?
  // Let's check by comparing all 6 production runs' prompts
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 9: What if the check ordering is different?");
  console.log("=".repeat(70));
  console.log("Checks 1-3 pass (depreciation vouchers — 3 assets = 3 checks)");
  console.log("Check 4 fails (COULD be: prepaid reversal, OR tax provision, OR disposition)");
  console.log("Check 5 fails (COULD be: prepaid reversal, OR tax provision, OR disposition)");
  console.log("Check 6 passes (COULD be: some overall check that doesn't depend on specific vouchers)");
  console.log("");
  console.log("If Check 6 passes WITHOUT disposition, then either:");
  console.log("  a) Check 6 is not about disposition at all");
  console.log("  b) Check 6 has a different tolerance/criteria");
  console.log("");
  console.log("Hypothesis: Maybe Check 4 = tax provision (wrong because of bad calculation),");
  console.log("  and Check 5 = disposition (never posted in runs 1-4, wrong account in run 5)");
  console.log("  and Check 6 = prepaid reversal (passes because 6300 is correct!)");
  console.log("");
  console.log("BUT WAIT — if Check 6 = prepaid reversal, it would explain why it always passes.");
  console.log("Then checks 4+5 could be: one about tax, one about disposition.");
  console.log("Run 5 added disposition with 8960 but checks 4+5 STILL failed.");
  console.log("This means: if checks 4+5 are tax+disposition,");
  console.log("  - tax could be wrong due to calculation error");
  console.log("  - disposition used wrong account (8960 instead of 8800)");
  console.log("This is consistent! Both could fail simultaneously.");

  // =====================================================================
  // EXPERIMENT 10: Check the tax calculation more carefully
  // In production, the balance sheet includes revenues that offset expenses
  // Let me verify: does the post-then-read approach correctly capture
  // the pre-existing revenues + our new postings?
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 10: Tax calculation verification");
  console.log("=".repeat(70));

  // In a fresh prod env, the balance sheet at 3000-8700 would include:
  // - Revenue accounts (3000s): NEGATIVE balances (credits)
  // - COGS accounts (4000s): POSITIVE balances (debits)
  // - Operating expenses (5000-6999): POSITIVE balances (debits)
  // - Our new postings: 6010 (debit) and 6300 (debit)
  //
  // Sum of all = net result. If revenues > expenses, sum is negative, preTaxProfit is positive.
  //
  // The formula: preTaxProfit = -(sumOfBalanceOut)
  // taxAmount = Math.round(preTaxProfit * 0.22)
  //
  // This should be correct IF the balance sheet range includes ALL result accounts.
  //
  // BUT WAIT: what if the range 3000-8700 MISSES some accounts?
  // - 8700 is the tax expense account (newly created, balance 0) — OK
  // - What about accounts 8001-8699? Financial income/expense?
  // Let me check what exists in the 8000-8699 range.

  console.log("Accounts 8000-8699 (financial income/expense):");
  for (const a of allAccts.data?.values || []) {
    if (a.number >= 8000 && a.number <= 8699) {
      console.log(`  ${a.number}: "${a.name}"`);
    }
  }

  // In the sandbox, what balances exist in 8000-8699?
  const bs8000 = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8000&accountNumberTo=8699&fields=*,account(id,number,name)&count=200");
  console.log("\nBalance sheet 8000-8699:");
  for (const row of bs8000.data?.values || []) {
    if (row.balanceOut !== 0) {
      console.log(`  ${row.account?.number} "${row.account?.name}": ${row.balanceOut}`);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("ALL EXPERIMENTS COMPLETE");
  console.log("=".repeat(70));
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
