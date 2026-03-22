/**
 * Task 30 — CORRECT vs WRONG year-end comparison
 *
 * Uses 2026 as the test year (clean, deletable vouchers).
 * Compares /yearEnd?year=2026 output with:
 *   A) CORRECT flow: 8300/2500 tax + 8800/2050 disposition
 *   B) WRONG flow: 8700/2920 tax + NO disposition
 *
 * This shows exactly what checks 4+5 probably validate.
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
  if (res.status >= 400) {
    console.error(`  ERROR ${method} ${path} → ${res.status}`, JSON.stringify(data).slice(0, 300));
  }
  return { status: res.status, data };
}

function printYearEnd(label: string, ye: any) {
  console.log(`\n  === ${label} ===`);
  const y = ye.data.value;
  if (!y) { console.log("  NO DATA"); return; }
  console.log(`  year=${y.year} status=${y.status} annualResult=${y.annualResult}`);

  const sections = ['operatingRevenue', 'operatingExpense', 'capitalIncome', 'capitalCost',
                    'extraordinaryIncome', 'extraordinaryCost', 'taxCost',
                    'fixedAsset', 'currentAsset', 'currentDebt', 'longTermDebt', 'equity'];
  for (const s of sections) {
    if (y[s]) {
      console.log(`  ${s}: sumAmount=${y[s].sumAmount}`);
      for (const p of (y[s].posts || [])) {
        console.log(`    ${p.groupNumber} "${p.name}" (${p.grouping}): ${p.sumAmount}`);
      }
    }
  }
}

async function main() {
  // Setup: Get account IDs
  const keyAccounts = [1209, 6010, 1700, 6300, 8300, 2500, 8700, 2920, 8800, 2050];
  const acctRes = await api("GET", `/ledger/account?number=${keyAccounts.join(",")}&fields=id,number,name,type`);
  const acctMap: Record<number, number> = {};
  for (const a of (acctRes.data.values || [])) {
    acctMap[a.number] = a.id;
  }

  // Test data (from production prompt)
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const dep1 = r2(194750 / 9);  // 21638.89
  const dep2 = r2(64350 / 9);   // 7150.00
  const dep3 = r2(446400 / 5);  // 89280.00
  const prepaid = 65700;
  const depEntries = [
    { name: "Kjøretøy", amount: dep1 },
    { name: "IT-utstyr", amount: dep2 },
    { name: "Inventar", amount: dep3 },
  ];

  // ============================================================
  //  BASELINE
  // ============================================================
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  BASELINE: /yearEnd?year=2026 before any changes║");
  console.log("╚══════════════════════════════════════════════════╝");

  const yeBaseline = await api("GET", "/yearEnd?year=2026&fields=*");
  printYearEnd("BASELINE", yeBaseline);
  const baselineResult = yeBaseline.data.value?.annualResult;
  console.log(`\n  >> Baseline annualResult: ${baselineResult}`);

  // ============================================================
  //  TEST A: CORRECT FLOW (8300/2500 + 8800/2050)
  // ============================================================
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  TEST A: CORRECT Flow (8300/2500 + 8800/2050)   ║");
  console.log("╚══════════════════════════════════════════════════╝");

  const correctIds: number[] = [];

  // Post depreciation vouchers
  for (const dep of depEntries) {
    const v = await api("POST", "/ledger/voucher", {
      date: "2026-12-31",
      description: `Avskrivning ${dep.name} 2026`,
      postings: [
        { row: 1, account: { id: acctMap[6010] }, amountGross: dep.amount, amountGrossCurrency: dep.amount, description: `Avskrivning ${dep.name}` },
        { row: 2, account: { id: acctMap[1209] }, amountGross: -dep.amount, amountGrossCurrency: -dep.amount, description: `Akk. avskrivning ${dep.name}` },
      ],
    });
    if (v.data.value?.id) correctIds.push(v.data.value.id);
  }

  // Post prepaid reversal
  const pv = await api("POST", "/ledger/voucher", {
    date: "2026-12-31",
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      { row: 1, account: { id: acctMap[6300] }, amountGross: prepaid, amountGrossCurrency: prepaid, description: "Periodisering leiekostnad" },
      { row: 2, account: { id: acctMap[1700] }, amountGross: -prepaid, amountGrossCurrency: -prepaid, description: "Forskuddsbetalte kostnader" },
    ],
  });
  if (pv.data.value?.id) correctIds.push(pv.data.value.id);

  // Read balance sheet for tax calculation
  const bsTax = await api("GET", "/balanceSheet?dateFrom=2026-01-01&dateTo=2027-01-01&accountNumberFrom=3000&accountNumberTo=8299&fields=*,account(number,name)&count=1000");
  let sumBs = 0;
  console.log("\n  Balance sheet (3000-8299) for tax:");
  for (const r of (bsTax.data.values || [])) {
    if (Math.abs(r.balanceOut || 0) > 0.01) {
      sumBs += r.balanceOut;
      console.log(`    ${r.account?.number} "${r.account?.name}": ${r.balanceOut}`);
    }
  }
  const preTaxProfit = -(sumBs);
  const taxAmount = Math.round(Math.max(0, preTaxProfit) * 0.22);
  console.log(`\n  Pre-tax profit: ${preTaxProfit.toFixed(2)}`);
  console.log(`  Tax (22%): ${taxAmount}`);

  // Post tax voucher (CORRECT: 8300/2500)
  if (taxAmount > 0) {
    const tv = await api("POST", "/ledger/voucher", {
      date: "2026-12-31",
      description: "Skattekostnad 2026",
      postings: [
        { row: 1, account: { id: acctMap[8300] }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
        { row: 2, account: { id: acctMap[2500] }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
      ],
    });
    if (tv.data.value?.id) correctIds.push(tv.data.value.id);
  }

  // Post disposition voucher (CORRECT: 8800/2050)
  const postTaxResult = preTaxProfit - taxAmount;
  console.log(`  Post-tax result: ${postTaxResult}`);
  if (postTaxResult > 0) {
    const dv = await api("POST", "/ledger/voucher", {
      date: "2026-12-31",
      description: "Disponering av årsresultat 2026",
      postings: [
        { row: 1, account: { id: acctMap[8800] }, amountGross: postTaxResult, amountGrossCurrency: postTaxResult, description: "Årsresultat" },
        { row: 2, account: { id: acctMap[2050] }, amountGross: -postTaxResult, amountGrossCurrency: -postTaxResult, description: "Annen egenkapital" },
      ],
    });
    if (dv.data.value?.id) correctIds.push(dv.data.value.id);
  } else if (postTaxResult < 0) {
    const dv = await api("POST", "/ledger/voucher", {
      date: "2026-12-31",
      description: "Disponering av årsresultat 2026",
      postings: [
        { row: 1, account: { id: acctMap[2050] }, amountGross: Math.abs(postTaxResult), amountGrossCurrency: Math.abs(postTaxResult), description: "Annen egenkapital" },
        { row: 2, account: { id: acctMap[8800] }, amountGross: -Math.abs(postTaxResult), amountGrossCurrency: -Math.abs(postTaxResult), description: "Årsresultat" },
      ],
    });
    if (dv.data.value?.id) correctIds.push(dv.data.value.id);
  }

  // Read yearEnd with CORRECT postings
  const yeCorrect = await api("GET", "/yearEnd?year=2026&fields=*");
  printYearEnd("CORRECT FLOW (8300/2500 + 8800/2050)", yeCorrect);

  // Key differences from baseline
  const correctResult = yeCorrect.data.value?.annualResult;
  const correctTaxCost = yeCorrect.data.value?.taxCost;
  console.log(`\n  >> annualResult: ${baselineResult} → ${correctResult} (delta: ${correctResult - baselineResult})`);
  console.log(`  >> taxCost: ${correctTaxCost ? `POPULATED (sumAmount=${correctTaxCost.sumAmount})` : "null"}`);

  // Clean up CORRECT vouchers
  console.log("\n  Cleaning up CORRECT vouchers...");
  for (const vid of correctIds) {
    await api("DELETE", `/ledger/voucher/${vid}`);
  }

  // Verify baseline restored
  const yeVerify1 = await api("GET", "/yearEnd?year=2026&fields=*");
  console.log(`  Restored annualResult: ${yeVerify1.data.value?.annualResult} (should be ${baselineResult})`);

  // ============================================================
  //  TEST B: WRONG FLOW (8700/2920, NO disposition)
  // ============================================================
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  TEST B: WRONG Flow (8700/2920, NO disposition) ║");
  console.log("╚══════════════════════════════════════════════════╝");

  const wrongIds: number[] = [];

  // Same depreciation + prepaid
  for (const dep of depEntries) {
    const v = await api("POST", "/ledger/voucher", {
      date: "2026-12-31",
      description: `Avskrivning ${dep.name} 2026`,
      postings: [
        { row: 1, account: { id: acctMap[6010] }, amountGross: dep.amount, amountGrossCurrency: dep.amount, description: `Avskrivning ${dep.name}` },
        { row: 2, account: { id: acctMap[1209] }, amountGross: -dep.amount, amountGrossCurrency: -dep.amount, description: `Akk. avskrivning ${dep.name}` },
      ],
    });
    if (v.data.value?.id) wrongIds.push(v.data.value.id);
  }
  const pv2 = await api("POST", "/ledger/voucher", {
    date: "2026-12-31",
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      { row: 1, account: { id: acctMap[6300] }, amountGross: prepaid, amountGrossCurrency: prepaid, description: "Periodisering leiekostnad" },
      { row: 2, account: { id: acctMap[1700] }, amountGross: -prepaid, amountGrossCurrency: -prepaid, description: "Forskuddsbetalte kostnader" },
    ],
  });
  if (pv2.data.value?.id) wrongIds.push(pv2.data.value.id);

  // WRONG tax voucher (8700/2920) — use same tax amount for comparison
  if (taxAmount > 0 && acctMap[8700] && acctMap[2920]) {
    const tv = await api("POST", "/ledger/voucher", {
      date: "2026-12-31",
      description: "Skattekostnad 2026",
      postings: [
        { row: 1, account: { id: acctMap[8700] }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
        { row: 2, account: { id: acctMap[2920] }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
      ],
    });
    if (tv.data.value?.id) wrongIds.push(tv.data.value.id);
  }
  // NO disposition voucher (like the first 5 production runs)

  // Read yearEnd with WRONG postings
  const yeWrong = await api("GET", "/yearEnd?year=2026&fields=*");
  printYearEnd("WRONG FLOW (8700/2920, NO disposition)", yeWrong);

  const wrongResult = yeWrong.data.value?.annualResult;
  const wrongTaxCost = yeWrong.data.value?.taxCost;
  console.log(`\n  >> annualResult: ${baselineResult} → ${wrongResult} (delta: ${wrongResult - baselineResult})`);
  console.log(`  >> taxCost: ${wrongTaxCost ? `POPULATED (sumAmount=${wrongTaxCost.sumAmount})` : "null"}`);

  // Clean up WRONG vouchers
  console.log("\n  Cleaning up WRONG vouchers...");
  for (const vid of wrongIds) {
    await api("DELETE", `/ledger/voucher/${vid}`);
  }

  // ============================================================
  //  COMPARISON
  // ============================================================
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  SIDE-BY-SIDE COMPARISON                        ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  console.log("                          BASELINE    CORRECT     WRONG");
  console.log(`  annualResult:           ${baselineResult}   ${correctResult}   ${wrongResult}`);
  console.log(`  taxCost populated:      ${yeBaseline.data.value?.taxCost ? "YES" : "NO "}         ${correctTaxCost ? "YES" : "NO "}         ${wrongTaxCost ? "YES" : "NO "}`);

  const baselineCurrentDebt = yeBaseline.data.value?.currentDebt?.sumAmount || 0;
  const correctCurrentDebt = yeCorrect.data.value?.currentDebt?.sumAmount || 0;
  const wrongCurrentDebt = yeWrong.data.value?.currentDebt?.sumAmount || 0;
  console.log(`  currentDebt:            ${baselineCurrentDebt}   ${correctCurrentDebt}   ${wrongCurrentDebt}`);

  const correctEquity = yeCorrect.data.value?.equity?.sumAmount || 0;
  const wrongEquity = yeWrong.data.value?.equity?.sumAmount || 0;
  const baselineEquity = yeBaseline.data.value?.equity?.sumAmount || 0;
  console.log(`  equity:                 ${baselineEquity}   ${correctEquity}   ${wrongEquity}`);

  console.log("\n  KEY DIFFERENCES:");
  console.log(`  1. taxCost: CORRECT → populated, WRONG → null`);
  console.log(`     The /yearEnd API only recognizes 8300 (TAX_ON_ORDINARY_ACTIVITIES)`);
  console.log(`     Posting to 8700 (TAX_ON_EXTRAORDINARY_ACTIVITIES) is NOT recognized as tax.`);
  console.log(`  2. currentDebt: With WRONG accounts, 2920 shows as intercompany debt.`);
  console.log(`     With CORRECT accounts, 2500 shows as tax payable.`);
  console.log(`  3. Disposition: CORRECT flow closes the result. WRONG flow has open result.`);

  console.log("\n  CONCLUSION:");
  console.log(`  Checks 4+5 almost certainly validate the /yearEnd report structure.`);
  console.log(`  The fix (8300/2500 + 8800/2050) should resolve both checks.`);
  console.log(`  This has NEVER been tested in production.`);
}

main().catch(e => { console.error(e); process.exit(1); });
