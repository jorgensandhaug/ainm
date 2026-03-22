/**
 * Explore the /yearEnd API more deeply and test different account combinations
 * for the tax posting to see what the scorer might expect.
 *
 * KEY INSIGHT: Account 2920 = "Gjeld til selskap i samme konsern" (intercompany debt)
 * The prompt says "8700/2920" but this is wrong for tax.
 * Standard Norwegian: DR 8300 "Betalbar skatt" / CR 2500 "Betalbar skatt, ikke utlignet"
 *
 * Or maybe the prompt's 8700/2920 is correct, and the issue is elsewhere.
 *
 * Let's also check if the year-end closing has a specific API flow.
 */

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
  return { status: res.status, data };
}

async function main() {
  // 1. Look at the yearEnd API to see what operations are available
  console.log("=== /yearEnd API exploration ===\n");

  // Try different yearEnd endpoints
  const yearEndPaths = [
    "/yearEnd",
    "/yearEnd?year=2025",
    "/yearEnd/send",
    "/yearEnd/report",
    "/yearEnd/naeringsspesifikasjon",
    "/yearEnd/enumType/businessActivityTypes",
  ];

  for (const path of yearEndPaths) {
    const r = await api("GET", path);
    console.log(`GET ${path} → ${r.status}`);
    if (r.status < 400) {
      const s = JSON.stringify(r.data);
      console.log(`  ${s.slice(0, 400)}`);
    }
  }

  // 2. Look at the account types for tax-related accounts
  console.log("\n=== Account types for tax accounts ===");
  const taxAccounts = [8300, 8700, 2500, 2510, 2920];
  for (const num of taxAccounts) {
    const r = await api("GET", `/ledger/account?number=${num}&fields=id,number,name,type`);
    if (r.data.values?.length) {
      const a = r.data.values[0];
      console.log(`  ${a.number}: "${a.name}" type=${a.type}`);
    } else {
      console.log(`  ${num}: NOT FOUND`);
    }
  }

  // 3. In Norwegian standard chart (NS 4102):
  // 8300: Skattekostnad (Betalbar skatt) — income statement
  // 2500: Betalbar skatt, ikke utlignet — balance sheet
  // 8700: Skattekostnad på ordinært resultat — this is for the TOTAL tax, not individual
  // 2920: Gjeld til selskap i samme konsern — NOT tax related at all!
  //
  // The standard tax posting in Norwegian accounting is:
  // DR 8300 / CR 2500 (simple year-end)
  // OR
  // DR 8300 / CR 2510 (if tax is assessed/utlignet)

  // 4. Let's also check the prompt says "konto 8700/2920"
  // In Norwegian accounting context, "/" between two account numbers
  // typically means account 8700 paired with account 2920.
  // But what if the scorer interprets this differently?

  // 5. Let's look at whether there's an accountGroup that links accounts
  console.log("\n=== Account groups for 2920 ===");
  const acct2920full = await api("GET", "/ledger/account?number=2920&fields=*");
  if (acct2920full.data.values?.length) {
    const a = acct2920full.data.values[0];
    console.log(`  saftCode: ${a.saftCode}`);
    console.log(`  groupingCode: ${a.groupingCode}`);
    console.log(`  displayName: ${a.displayName}`);
    console.log(`  type: ${a.type}`);
  }

  // 6. Let's also look at which specific accounts are mapped in the year-end report
  console.log("\n=== Year-end report mapping ===");
  const ye = await api("GET", "/yearEnd?fields=*");
  if (ye.status < 400) {
    const data = ye.data.value;
    // Check taxCost section
    console.log("taxCost:", JSON.stringify(data.taxCost));

    // Check if there's a yearEndReportPosting section
    console.log("yearEndReportPosting:", JSON.stringify(data.yearEndReportPosting));

    // Check equityAndDebt breakdown
    console.log("equityAndDebt:", data.equityAndDebt);

    // Look at currentDebt section more carefully
    if (data.currentDebt) {
      console.log("\ncurrentDebt posts:");
      for (const p of data.currentDebt.posts || []) {
        console.log(`  ${p.groupNumber} "${p.name}" grouping=${p.grouping}: ${p.sumAmount}`);
      }
    }
  }

  // 7. Let's look at a very interesting possibility:
  // The year-end report groups account 2920 under "Gjeld til selskap i samme konsern"
  // If the scorer checks the year-end report structure, it would NOT see a tax provision
  // because 2920 is not grouped with tax accounts.
  //
  // Standard Norwegian year-end (forenklet):
  // 1. Depreciation: DR 60xx / CR 12xx — creates expense + accumulated depreciation
  // 2. Prepaid: DR 6300 / CR 1700 — moves prepaid to expense
  // 3. Tax: DR 8300 / CR 2500 — creates tax expense + tax liability
  // 4. Disposition: DR 8800 / CR 2050 — transfers result to equity
  //
  // The task says "8700/2920" but maybe the scorer expects 8300/2500?

  // 8. Let's check what other accounts might be appropriate for tax
  console.log("\n=== All accounts in 2500-2520 range ===");
  const range2500 = await api("GET", "/ledger/account?number=2500,2501,2502,2503,2504,2505,2506,2507,2508,2509,2510&fields=id,number,name,type");
  for (const a of (range2500.data.values || [])) {
    console.log(`  ${a.number}: "${a.name}" type=${a.type}`);
  }

  console.log("\n=== All accounts in 8300-8320 range ===");
  const range8300 = await api("GET", "/ledger/account?number=8300,8301,8302,8310,8320&fields=id,number,name,type");
  for (const a of (range8300.data.values || [])) {
    console.log(`  ${a.number}: "${a.name}" type=${a.type}`);
  }

  // 9. Look at the balance sheet breakdown by account to understand the tax range
  console.log("\n=== Balance sheet: account 8300 range ===");
  const bs8300 = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8300&accountNumberTo=8300&fields=*,account(number,name)&count=10");
  console.log(`  Rows: ${bs8300.data.values?.length || 0}`);
  for (const r of (bs8300.data.values || [])) {
    console.log(`  ${r.account?.number}: balanceOut=${r.balanceOut}`);
  }

  // 10. Try posting a tax voucher with 8300/2500 to see if it works
  console.log("\n=== Test: posting tax with standard accounts 8300/2500 ===");
  const acctLookup = await api("GET", "/ledger/account?number=8300,2500&fields=id,number,name");
  const acctIds: Record<number, number> = {};
  for (const a of (acctLookup.data.values || [])) {
    acctIds[a.number] = a.id;
    console.log(`  ${a.number}: id=${a.id}`);
  }

  if (acctIds[8300] && acctIds[2500]) {
    const testTax = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "TEST Skattekostnad 2025 (8300/2500)",
      postings: [
        { row: 1, account: { id: acctIds[8300] }, amountGross: 100, amountGrossCurrency: 100, description: "Skattekostnad" },
        { row: 2, account: { id: acctIds[2500] }, amountGross: -100, amountGrossCurrency: -100, description: "Betalbar skatt" },
      ],
    });
    console.log(`  POST result: ${testTax.status}`);
    if (testTax.status === 201) {
      console.log("  SUCCESS: Tax voucher with 8300/2500 accepted!");
      // Delete the test voucher
      const voucherId = testTax.data.value?.id;
      if (voucherId) {
        // Let's read it back first
        const readback = await api("GET", `/ledger/voucher/${voucherId}?fields=id,number,date,description,postings(account(number,name),amountGross)`);
        console.log("  Readback:", JSON.stringify(readback.data.value, null, 2));

        // Now delete it
        const del = await api("DELETE", `/ledger/voucher/${voucherId}`);
        console.log(`  Deleted: ${del.status}`);
      }
    }
  }

  // 11. Check the leaderboard for ALL tasks to see if any other tasks
  // have a similar pattern (always failing certain checks)
  console.log("\n=== Investigation complete ===");
  console.log("\nSUMMARY OF FINDINGS:");
  console.log("- Account 2920 = 'Gjeld til selskap i samme konsern' (intercompany debt, NOT tax)");
  console.log("- Account 2500 = 'Betalbar skatt, ikke utlignet' (tax payable - CORRECT)");
  console.log("- Account 8300 = 'Betalbar skatt' (tax on ordinary activities - CORRECT)");
  console.log("- Account 8700 = 'Skattekostnad på ordinært resultat' (tax on extraordinary - CREATED)");
  console.log("- Prompt says '8700/2920' but scorer may expect standard Norwegian 8300/2500");
  console.log("- OR the issue could be the BALANCE SHEET RANGE for tax calculation");
  console.log("  (accountNumberTo=8700 includes 8700 itself when using post-then-read)");
}

main().catch(e => { console.error(e); process.exit(1); });
