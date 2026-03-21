// Task 30 deep investigation: Why do checks 4 (prepaid reversal) and 5 (tax provision) ALWAYS fail?
//
// ALL 6 production runs score 6/10: checks 1-3 pass (depreciation), check 6 passes, checks 4+5 fail.
// Run 5 (1bb3d762) posted disposition with 8960/2050 — still failed.
//
// Hypotheses to test:
// H1: Prepaid reversal contra account 6300 is wrong — maybe needs a different account
// H2: Balance sheet range for tax is wrong (3000-8700 inclusive vs exclusive)
// H3: Tax rounding method is wrong (Math.round vs Math.floor)
// H4: Balance sheet dateTo is wrong (2026-01-01 vs 2025-12-31)
// H5: The checker looks at resultBudget/resultAccount endpoint, not balanceSheet
// H6: Check 4 = prepaid reversal, Check 5 = tax — or they could be something else entirely
// H7: Maybe the prepaid reversal amount needs to be the FULL balance on 1700, not just 45900
// H8: Maybe the prepaid should use a different DR account based on what's actually in 1700

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
  // PART 1: Understand account 1700 in this sandbox
  // =====================================================================
  console.log("=".repeat(70));
  console.log("PART 1: Account 1700 details and existing postings");
  console.log("=".repeat(70));

  const acct1700 = await api("GET", "/ledger/account?number=1700&fields=*");
  for (const a of acct1700.data?.values || []) {
    console.log(`  1700: "${a.name}" type=${a.type} id=${a.id}`);
  }

  // Check balance on 1700
  const bs1700 = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=1700&accountNumberTo=1700&fields=*,account(id,number,name)");
  console.log("\nBalance on 1700:", JSON.stringify(bs1700.data?.values?.[0]));

  // Check ALL postings on 1700
  const postings1700 = await api("GET", "/ledger/posting?accountNumberFrom=1700&accountNumberTo=1700&dateFrom=2024-01-01&dateTo=2026-12-31&fields=id,date,amount,amountGross,description,voucher(id,date,description,voucherType(id,name)),account(id,number,name)&count=200");
  console.log(`\nPostings on 1700: ${postings1700.data?.values?.length ?? 0}`);
  const voucherIdsOn1700 = new Set<number>();
  for (const p of postings1700.data?.values || []) {
    console.log(`  date=${p.date} amount=${p.amount} desc="${p.description}" voucher="${p.voucher?.description}" type=${p.voucher?.voucherType?.name}`);
    if (p.voucher?.id) voucherIdsOn1700.add(p.voucher.id);
  }

  // For each voucher touching 1700, see ALL postings (to find contra accounts)
  console.log(`\nVouchers touching 1700: ${voucherIdsOn1700.size}`);
  for (const vid of voucherIdsOn1700) {
    const vr = await api("GET", `/ledger/voucher/${vid}?fields=id,date,description,voucherType(id,name),postings(id,row,account(id,number,name),amount,amountGross,description)`);
    const v = vr.data?.value;
    console.log(`\n  Voucher ${vid} (${v?.date}, "${v?.description}", type=${v?.voucherType?.name}):`);
    for (const p of v?.postings || []) {
      console.log(`    row=${p.row} acct=${p.account?.number} "${p.account?.name}" amount=${p.amount} gross=${p.amountGross} desc="${p.description}"`);
    }
  }

  // =====================================================================
  // PART 2: Balance sheet comparisons with different ranges and dates
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("PART 2: Balance sheet range and date experiments");
  console.log("=".repeat(70));

  // Range tests
  const ranges = [
    { from: 3000, to: 8699, label: "3000-8699 (stop before tax)" },
    { from: 3000, to: 8700, label: "3000-8700 (current prod)" },
    { from: 3000, to: 8799, label: "3000-8799" },
    { from: 3000, to: 8999, label: "3000-8999 (all result)" },
    { from: 3000, to: 9999, label: "3000-9999 (everything)" },
  ];

  for (const r of ranges) {
    const bs = await api("GET", `/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=${r.from}&accountNumberTo=${r.to}&fields=*,account(id,number,name)&count=2000`);
    let sum = 0;
    const nonZero: string[] = [];
    for (const row of bs.data?.values || []) {
      sum += row.balanceOut || 0;
      if (row.balanceOut !== 0) {
        nonZero.push(`${row.account?.number}=${row.balanceOut}`);
      }
    }
    console.log(`  Range ${r.label}: sum=${sum}, preTaxProfit=${-sum}, count=${bs.data?.values?.length ?? 0}`);
    if (nonZero.length <= 20) {
      console.log(`    Non-zero: ${nonZero.join(", ")}`);
    }
  }

  // Date tests
  console.log("\n--- Date variations ---");
  const dates = [
    { from: "2025-01-01", to: "2025-12-31", label: "dateTo=2025-12-31 (might exclude Dec 31)" },
    { from: "2025-01-01", to: "2026-01-01", label: "dateTo=2026-01-01 (current prod)" },
    { from: "2025-01-01", to: "2025-12-30", label: "dateTo=2025-12-30 (clearly excludes Dec)" },
  ];

  for (const d of dates) {
    const bs = await api("GET", `/balanceSheet?dateFrom=${d.from}&dateTo=${d.to}&accountNumberFrom=3000&accountNumberTo=8700&fields=*,account(id,number,name)&count=2000`);
    let sum = 0;
    for (const row of bs.data?.values || []) {
      sum += row.balanceOut || 0;
    }
    console.log(`  ${d.label}: sum=${sum}, preTaxProfit=${-sum}`);
  }

  // =====================================================================
  // PART 3: Try resultBudget / result endpoints
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("PART 3: Alternative result/profit endpoints");
  console.log("=".repeat(70));

  const endpoints = [
    "/resultBudget?dateFrom=2025-01-01&dateTo=2026-01-01&fields=*&count=10",
    "/resultBudget?year=2025&fields=*&count=10",
    "/ledger/annualAccount?year=2025&fields=*&count=10",
    "/ledger/annualAccounts?year=2025&fields=*&count=10",
    "/yearEndReport?year=2025",
    "/ledger/closeGroup?dateFrom=2025-01-01&dateTo=2026-01-01&fields=*&count=50",
  ];

  for (const ep of endpoints) {
    await api("GET", ep);
  }

  // =====================================================================
  // PART 4: Check accounts in 1700 range (prepaid variants)
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("PART 4: All accounts 1700-1799 and potential contra accounts");
  console.log("=".repeat(70));

  const prepaidAccts = await api("GET", "/ledger/account?numberFrom=1700&numberTo=1799&fields=id,number,name&count=100");
  for (const a of prepaidAccts.data?.values || []) {
    console.log(`  ${a.number}: "${a.name}" (id=${a.id})`);
  }

  // Check accounts around 6300 range
  console.log("\n--- Expense accounts 6000-6999 ---");
  const expAccts = await api("GET", "/ledger/account?numberFrom=6000&numberTo=6999&fields=id,number,name&count=200");
  for (const a of expAccts.data?.values || []) {
    console.log(`  ${a.number}: "${a.name}"`);
  }

  // =====================================================================
  // PART 5: Full simulation of the task flow on sandbox
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("PART 5: Full simulation - post everything and check result");
  console.log("=".repeat(70));

  // Get all needed accounts
  const allAccts = await api("GET", "/ledger/account?number=1209,6010,1700,6300,8700,2920,8800,2050&fields=id,number,name&count=20");
  const acctMap: Record<number, { id: number; number: number; name: string }> = {};
  for (const a of allAccts.data?.values || []) {
    acctMap[a.number] = a;
    console.log(`  ${a.number}: "${a.name}" id=${a.id}`);
  }

  // Create missing accounts
  const missing: { number: number; name: string }[] = [];
  const nameMap: Record<number, string> = {
    1209: "Akkumulerte avskrivninger",
    8700: "Skattekostnad på ordinært resultat",
  };
  for (const n of [1209, 8700]) {
    if (!acctMap[n]) missing.push({ number: n, name: nameMap[n] });
  }

  if (missing.length > 0) {
    console.log(`\nCreating missing accounts: ${missing.map(m => m.number).join(", ")}`);
    const created = missing.length === 1
      ? await api("POST", "/ledger/account", missing[0])
      : await api("POST", "/ledger/account/list", missing);

    if (missing.length === 1) {
      const a = created.data?.value;
      if (a) acctMap[a.number] = a;
    } else {
      for (const a of created.data?.values || []) {
        acctMap[a.number] = a;
      }
    }
  }

  const id = (n: number) => acctMap[n]?.id;

  // Task params (from the prompt)
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const dep1 = r2(329750 / 4);   // Kontormaskiner = 82437.50
  const dep2 = r2(217500 / 6);   // Inventar = 36250.00
  const dep3 = r2(108950 / 9);   // Programvare = 12105.56
  console.log(`\nDepreciation: ${dep1} + ${dep2} + ${dep3} = ${r2(dep1 + dep2 + dep3)}`);

  // Post 3 depreciation vouchers
  const depEntries = [
    { name: "Kontormaskiner", amount: dep1 },
    { name: "Inventar", amount: dep2 },
    { name: "Programvare", amount: dep3 },
  ];

  for (const dep of depEntries) {
    const vr = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: `Avskrivning ${dep.name} 2025`,
      postings: [
        { row: 1, account: { id: id(6010) }, amountGross: dep.amount, amountGrossCurrency: dep.amount, description: `Avskrivning ${dep.name}` },
        { row: 2, account: { id: id(1209) }, amountGross: -dep.amount, amountGrossCurrency: -dep.amount, description: `Akk. avskrivning ${dep.name}` },
      ],
    });
    console.log(`  Posted dep ${dep.name}: ${dep.amount} => voucher ${vr.data?.value?.id}`);
  }

  // Post prepaid reversal: DR 6300 / CR 1700
  const prepaidVoucher = await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      { row: 1, account: { id: id(6300) }, amountGross: 45900, amountGrossCurrency: 45900, description: "Periodisering leiekostnad" },
      { row: 2, account: { id: id(1700) }, amountGross: -45900, amountGrossCurrency: -45900, description: "Forskuddsbetalte kostnader" },
    ],
  });
  console.log(`  Posted prepaid reversal: 45900 => voucher ${prepaidVoucher.data?.value?.id}`);

  // Read balance sheet AFTER posting vouchers
  console.log("\n--- Balance sheet AFTER depreciation + prepaid ---");
  const bsAfter = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8700&fields=*,account(id,number,name)&count=2000");
  let sumBalanceOut = 0;
  for (const row of bsAfter.data?.values || []) {
    if (row.balanceOut !== 0) {
      console.log(`  ${row.account?.number} "${row.account?.name}": balanceOut=${row.balanceOut}`);
    }
    sumBalanceOut += row.balanceOut || 0;
  }
  const preTaxProfit = -sumBalanceOut;
  console.log(`\n  Sum balanceOut: ${sumBalanceOut}`);
  console.log(`  Pre-tax profit: ${preTaxProfit}`);

  // Tax calculations with different methods
  const taxRound = Math.round(Math.max(0, preTaxProfit) * 0.22);
  const taxFloor = Math.floor(Math.max(0, preTaxProfit) * 0.22);
  const taxCeil = Math.ceil(Math.max(0, preTaxProfit) * 0.22);
  const taxR2 = r2(Math.max(0, preTaxProfit) * 0.22);
  console.log(`\n  Tax (Math.round): ${taxRound}`);
  console.log(`  Tax (Math.floor): ${taxFloor}`);
  console.log(`  Tax (Math.ceil):  ${taxCeil}`);
  console.log(`  Tax (r2 2-dec):   ${taxR2}`);

  // Post tax voucher with Math.round
  const taxAmount = taxRound;
  if (taxAmount > 0) {
    const taxVoucher = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Skattekostnad 2025",
      postings: [
        { row: 1, account: { id: id(8700) }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
        { row: 2, account: { id: id(2920) }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
      ],
    });
    console.log(`\n  Posted tax: ${taxAmount} => voucher ${taxVoucher.data?.value?.id}`);
  }

  // =====================================================================
  // PART 6: Post disposition with 8800/2050 (the corrected accounts)
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("PART 6: Result disposition with 8800/2050");
  console.log("=".repeat(70));

  const postTaxResult = r2(preTaxProfit - taxAmount);
  console.log(`  Post-tax result: ${postTaxResult}`);

  if (postTaxResult > 0) {
    const dispVoucher = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Disponering av årsresultat 2025",
      postings: [
        { row: 1, account: { id: id(8800) }, amountGross: postTaxResult, amountGrossCurrency: postTaxResult, description: "Årsresultat" },
        { row: 2, account: { id: id(2050) }, amountGross: -postTaxResult, amountGrossCurrency: -postTaxResult, description: "Annen egenkapital" },
      ],
    });
    console.log(`  Posted disposition (8800/2050): ${postTaxResult} => voucher ${dispVoucher.data?.value?.id}`);
  } else if (postTaxResult < 0) {
    const absResult = Math.abs(postTaxResult);
    const dispVoucher = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Disponering av årsresultat 2025",
      postings: [
        { row: 1, account: { id: id(2050) }, amountGross: absResult, amountGrossCurrency: absResult, description: "Annen egenkapital" },
        { row: 2, account: { id: id(8800) }, amountGross: -absResult, amountGrossCurrency: -absResult, description: "Årsresultat" },
      ],
    });
    console.log(`  Posted disposition (2050/8800 loss): ${absResult} => voucher ${dispVoucher.data?.value?.id}`);
  }

  // =====================================================================
  // PART 7: Verify final state — all vouchers
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("PART 7: Final verification — all vouchers posted today");
  console.log("=".repeat(70));

  const allVouchers = await api("GET", "/ledger/voucher?dateFrom=2025-12-31&dateTo=2025-12-31&fields=id,date,description,number,voucherType(id,name),postings(id,row,account(id,number,name),amount,amountGross,description)&count=100");
  for (const v of allVouchers.data?.values || []) {
    console.log(`\nVoucher ${v.id} (#${v.number}, "${v.description}", type=${v.voucherType?.name}):`);
    for (const p of v.postings || []) {
      console.log(`  row=${p.row} acct=${p.account?.number} "${p.account?.name}" amount=${p.amount} gross=${p.amountGross} desc="${p.description}"`);
    }
  }

  // =====================================================================
  // PART 8: Cross-check balance sheet AFTER all vouchers (including tax + disposition)
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("PART 8: Final balance sheet state");
  console.log("=".repeat(70));

  const bsFinal = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=1000&accountNumberTo=9999&fields=*,account(id,number,name)&count=5000");
  let totalAssets = 0, totalLiab = 0, totalResult = 0;
  for (const row of bsFinal.data?.values || []) {
    const num = row.account?.number;
    const bal = row.balanceOut;
    if (bal === 0) continue;
    if (num < 2000) { totalAssets += bal; console.log(`  ASSET  ${num} "${row.account?.name}": ${bal}`); }
    else if (num < 3000) { totalLiab += bal; console.log(`  LIAB   ${num} "${row.account?.name}": ${bal}`); }
    else { totalResult += bal; console.log(`  RESULT ${num} "${row.account?.name}": ${bal}`); }
  }
  console.log(`\n  Total Assets: ${totalAssets}`);
  console.log(`  Total Liabilities: ${totalLiab}`);
  console.log(`  Total Result: ${totalResult}`);
  console.log(`  Assets + Liab + Result = ${r2(totalAssets + totalLiab + totalResult)}`);

  // =====================================================================
  // PART 9: Critical question — does the checker look at 1700 balance?
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("PART 9: Account 1700 balance after reversal");
  console.log("=".repeat(70));

  const bs1700After = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=1700&accountNumberTo=1700&fields=*,account(id,number,name)");
  console.log("1700 balance after reversal:", JSON.stringify(bs1700After.data?.values?.[0]));

  // =====================================================================
  // PART 10: Check if there's a /ledger/closeGroup or /yearEnd endpoint
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("PART 10: Year-end / close group / annual accounts endpoints");
  console.log("=".repeat(70));

  const moreEndpoints = [
    "/ledger/closeGroup?dateFrom=2025-01-01&dateTo=2025-12-31&fields=*&count=50",
    "/ledger/closeGroup?year=2025&fields=*&count=50",
    "/yearEnd?year=2025",
    "/yearEnd?fields=*&count=10",
    "/annualAccounts?year=2025&fields=*&count=10",
    "/ledger/account/closingBalance?dateFrom=2025-01-01&dateTo=2025-12-31&fields=*&count=50",
  ];

  for (const ep of moreEndpoints) {
    await api("GET", ep);
  }

  // =====================================================================
  // PART 11: Check if check 4 could be about ACCOUNT 1700 remaining balance
  // Maybe the check verifies 1700 balance is ZERO after reversal?
  // The task says "total 45900 NOK na conta 1700" — but what if there's MORE on 1700?
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("PART 11: Does 1700 have a DIFFERENT opening balance than 45900?");
  console.log("=".repeat(70));

  // Check full history of 1700
  const fullBs1700 = await api("GET", "/balanceSheet?dateFrom=2024-01-01&dateTo=2026-01-01&accountNumberFrom=1700&accountNumberTo=1700&fields=*,account(id,number,name)");
  console.log("Full period 1700 balance:", JSON.stringify(fullBs1700.data?.values?.[0]));

  // Check opening balance specifically
  const ob1700 = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2025-01-02&accountNumberFrom=1700&accountNumberTo=1700&fields=*,account(id,number,name)");
  console.log("Opening 1700 balance (2025-01-01):", JSON.stringify(ob1700.data?.values?.[0]));

  // =====================================================================
  // PART 12: Look for ALL voucher types and check if "Årsoppgjør" type exists
  // Maybe the checker wants year-end vouchers to use a specific voucherType
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("PART 12: Voucher types — is there a year-end type?");
  console.log("=".repeat(70));

  const vTypes = await api("GET", "/ledger/voucherType?fields=id,name&count=100");
  for (const vt of vTypes.data?.values || []) {
    console.log(`  id=${vt.id}: "${vt.name}"`);
  }

  console.log("\n" + "=".repeat(70));
  console.log("DONE — ALL EXPERIMENTS COMPLETE");
  console.log("=".repeat(70));
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
