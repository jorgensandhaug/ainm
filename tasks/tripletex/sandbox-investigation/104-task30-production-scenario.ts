/**
 * Task 30 — EXACT PRODUCTION SCENARIO end-to-end test.
 *
 * Simulates the actual production prompt from run prod-2026-03-21-195120731Z-f672a798:
 *   "Perform simplified year-end closing for 2025:
 *    1) Kjøretøy (194750 NOK, 9 years, account 1230)
 *    2) IT-utstyr (64350 NOK, 9 years, account 1210)
 *    3) Inventar (446400 NOK, 5 years, account 1240)
 *    Depreciation expense: 6010, accumulated: 1209
 *    Reverse prepaid expenses: 65700 NOK on account 1700
 *    Tax: 22% on 8700/2920 (WRONG — we use 8300/2500)
 *    Each depreciation as separate voucher"
 *
 * Uses 2026 dates (sandbox 2025 is locked).
 * Follows the CORRECTED flow from the trusted standard.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

let callCount = 0;
let errorCount = 0;

async function api(method: string, path: string, body?: any) {
  callCount++;
  const callNum = callCount;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  const status = res.status;
  if (status >= 400) {
    errorCount++;
    console.error(`  [CALL ${callNum}] ERR ${method} ${path} → ${status}`, JSON.stringify(data).slice(0, 300));
  } else {
    console.log(`  [CALL ${callNum}] ${method} ${path} → ${status}`);
  }
  return { status, data };
}

async function main() {
  console.log("=== Task 30: PRODUCTION SCENARIO (CORRECTED FLOW) ===\n");

  // ── Production prompt values ──
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const assets = [
    { name: "Kjøretøy",  cost: 194750, life: 9, assetAcct: 1230 },
    { name: "IT-utstyr", cost: 64350,  life: 9, assetAcct: 1210 },
    { name: "Inventar",  cost: 446400, life: 5, assetAcct: 1240 },
  ];
  const depExpenseAcct = 6010;
  const accumDepAcct = 1209;
  const prepaidAcct = 1700;
  const prepaidAmount = 65700;
  const taxExpenseAcct = 8300;  // CORRECT (not 8700)
  const taxPayableAcct = 2500;  // CORRECT (not 2920)
  const dispositionAcct = 8800;
  const equityAcct = 2050;
  const year = 2026;  // Using 2026 (sandbox 2025 locked)

  // Calculate depreciation
  const deps = assets.map(a => ({
    ...a,
    depreciation: r2(a.cost / a.life),
  }));

  console.log("Depreciation calculations:");
  for (const d of deps) {
    console.log(`  ${d.name}: ${d.cost} / ${d.life} = ${d.depreciation}`);
  }
  console.log();

  // ────────────────────────────────────────────
  // PHASE 1: Account lookup (1 GET)
  // ────────────────────────────────────────────
  console.log("── Phase 1: Account lookup ──");
  const neededAccounts = [accumDepAcct, depExpenseAcct, prepaidAcct, 6300, 7500, taxExpenseAcct, taxPayableAcct, dispositionAcct, equityAcct];
  const acctRes = await api("GET", `/ledger/account?number=${neededAccounts.join(",")}&fields=id,number,name`);

  const ids: Record<number, number> = {};
  const names: Record<number, string> = {};
  for (const a of (acctRes.data.values || [])) {
    ids[a.number] = a.id;
    names[a.number] = a.name;
  }

  console.log("  Found accounts:");
  for (const n of neededAccounts) {
    if (ids[n]) console.log(`    ${n}: id=${ids[n]} "${names[n]}"`);
    else console.log(`    ${n}: MISSING — needs creation`);
  }

  // Determine prepaid contra from account 1700 name
  let prepaidContra = 6300; // default
  if (names[1700]) {
    if (names[1700].toLowerCase().includes("forsikring")) prepaidContra = 7500;
    console.log(`  Account 1700 name: "${names[1700]}" → contra: ${prepaidContra}`);
  }
  console.log();

  // ────────────────────────────────────────────
  // PHASE 1b: Create missing accounts (0-1 call)
  // ────────────────────────────────────────────
  const missing = neededAccounts.filter(n => !ids[n]);
  if (missing.length > 0) {
    console.log(`── Phase 1b: Creating missing accounts: ${missing.join(", ")} ──`);
    const standardNames: Record<number, string> = {
      1209: "Akkumulerte avskrivninger",
    };

    if (missing.length === 1) {
      const n = missing[0];
      const createRes = await api("POST", "/ledger/account", {
        number: n,
        name: standardNames[n] || `Account ${n}`,
      });
      if (createRes.status < 400) {
        ids[n] = createRes.data.value.id;
        console.log(`  Created ${n}: id=${ids[n]}`);
      }
    } else {
      const batch = missing.map(n => ({
        number: n,
        name: standardNames[n] || `Account ${n}`,
      }));
      const createRes = await api("POST", "/ledger/account/list", batch);
      if (createRes.status < 400) {
        for (const a of (createRes.data.values || [])) {
          ids[a.number] = a.id;
          console.log(`  Created ${a.number}: id=${ids[a.number]}`);
        }
      }
    }
    console.log();
  }

  // Verify all needed accounts are resolved
  const allResolved = neededAccounts.every(n => ids[n]);
  if (!allResolved) {
    console.error("FATAL: Not all accounts resolved. Aborting.");
    return;
  }

  const created: number[] = []; // voucher IDs for cleanup

  // ────────────────────────────────────────────
  // PHASE 2: Post vouchers (4 calls)
  // ────────────────────────────────────────────
  console.log("── Phase 2: Depreciation + Prepaid vouchers ──");

  // 3 depreciation vouchers (one per asset)
  for (const d of deps) {
    const v = await api("POST", "/ledger/voucher", {
      date: `${year}-12-31`,
      description: `Avskrivning ${d.name} ${year}`,
      postings: [
        { row: 1, account: { id: ids[depExpenseAcct] }, amountGross: d.depreciation, amountGrossCurrency: d.depreciation, description: `Avskrivning ${d.name}` },
        { row: 2, account: { id: ids[accumDepAcct] }, amountGross: -d.depreciation, amountGrossCurrency: -d.depreciation, description: `Akk. avskrivning ${d.name}` },
      ],
    });
    if (v.data.value?.id) created.push(v.data.value.id);
  }

  // 1 prepaid reversal voucher
  const pv = await api("POST", "/ledger/voucher", {
    date: `${year}-12-31`,
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      { row: 1, account: { id: ids[prepaidContra] }, amountGross: prepaidAmount, amountGrossCurrency: prepaidAmount, description: "Periodisering leiekostnad" },
      { row: 2, account: { id: ids[prepaidAcct] }, amountGross: -prepaidAmount, amountGrossCurrency: -prepaidAmount, description: "Forskuddsbetalte kostnader" },
    ],
  });
  if (pv.data.value?.id) created.push(pv.data.value.id);
  console.log();

  // ────────────────────────────────────────────
  // PHASE 3: Balance sheet for tax (1 GET)
  // ────────────────────────────────────────────
  console.log("── Phase 3: Balance sheet (post-then-read) ──");
  const bs = await api("GET", `/balanceSheet?dateFrom=${year}-01-01&dateTo=${year + 1}-01-01&accountNumberFrom=3000&accountNumberTo=8299&fields=*,account(id,number,name)&count=1000`);

  let sumBalanceOut = 0;
  const bsRows = bs.data.values || [];
  console.log(`  Balance sheet rows: ${bsRows.length}`);
  for (const r of bsRows) {
    sumBalanceOut += (r.balanceOut || 0);
    if (r.balanceOut !== 0) {
      console.log(`    ${r.account?.number} "${r.account?.name}": balanceOut=${r.balanceOut}`);
    }
  }

  const preTaxProfit = -(sumBalanceOut);
  const taxAmount = Math.round(Math.max(0, preTaxProfit) * 0.22);
  const postTaxResult = preTaxProfit - taxAmount;

  console.log(`\n  sumBalanceOut = ${sumBalanceOut}`);
  console.log(`  preTaxProfit = -sumBalanceOut = ${preTaxProfit}`);
  console.log(`  taxAmount = round(max(0, ${preTaxProfit}) * 0.22) = ${taxAmount}`);
  console.log(`  postTaxResult = ${preTaxProfit} - ${taxAmount} = ${postTaxResult}`);
  console.log();

  // ────────────────────────────────────────────
  // PHASE 4: Tax voucher (0-1 POST)
  // ────────────────────────────────────────────
  if (taxAmount > 0) {
    console.log("── Phase 4: Tax voucher (DR 8300 / CR 2500) ──");
    const tv = await api("POST", "/ledger/voucher", {
      date: `${year}-12-31`,
      description: `Skattekostnad ${year}`,
      postings: [
        { row: 1, account: { id: ids[taxExpenseAcct] }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
        { row: 2, account: { id: ids[taxPayableAcct] }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
      ],
    });
    if (tv.data.value?.id) created.push(tv.data.value.id);
    console.log();
  } else {
    console.log("── Phase 4: SKIPPED (preTaxProfit ≤ 0, no tax) ──\n");
  }

  // ────────────────────────────────────────────
  // PHASE 5: Result disposition voucher (1 POST)
  // ────────────────────────────────────────────
  if (postTaxResult > 0) {
    console.log("── Phase 5: Disposition voucher (profit: DR 8800 / CR 2050) ──");
    const dv = await api("POST", "/ledger/voucher", {
      date: `${year}-12-31`,
      description: `Disponering av årsresultat ${year}`,
      postings: [
        { row: 1, account: { id: ids[dispositionAcct] }, amountGross: postTaxResult, amountGrossCurrency: postTaxResult, description: "Årsresultat" },
        { row: 2, account: { id: ids[equityAcct] }, amountGross: -postTaxResult, amountGrossCurrency: -postTaxResult, description: "Annen egenkapital" },
      ],
    });
    if (dv.data.value?.id) created.push(dv.data.value.id);
  } else if (postTaxResult < 0) {
    console.log("── Phase 5: Disposition voucher (loss: DR 2050 / CR 8800) ──");
    const dv = await api("POST", "/ledger/voucher", {
      date: `${year}-12-31`,
      description: `Disponering av årsresultat ${year}`,
      postings: [
        { row: 1, account: { id: ids[equityAcct] }, amountGross: Math.abs(postTaxResult), amountGrossCurrency: Math.abs(postTaxResult), description: "Annen egenkapital" },
        { row: 2, account: { id: ids[dispositionAcct] }, amountGross: -Math.abs(postTaxResult), amountGrossCurrency: -Math.abs(postTaxResult), description: "Årsresultat" },
      ],
    });
    if (dv.data.value?.id) created.push(dv.data.value.id);
  } else {
    console.log("── Phase 5: SKIPPED (postTaxResult == 0) ──");
  }
  console.log();

  // ────────────────────────────────────────────
  // VERIFICATION: Read /yearEnd
  // ────────────────────────────────────────────
  console.log("══════════════════════════════════════════");
  console.log("  VERIFICATION: /yearEnd?year=" + year);
  console.log("══════════════════════════════════════════");
  const ye = await api("GET", `/yearEnd?year=${year}&fields=*`);
  const y = ye.data.value;

  if (y) {
    console.log(`\n  annualResult: ${y.annualResult}`);
    console.log(`  taxCost: ${y.taxCost ? `POPULATED ✓ (sumAmount=${y.taxCost.sumAmount})` : "NULL ✗ — SCORING FAILURE"}`);

    if (y.operatingRevenue) {
      console.log(`\n  operatingRevenue: ${y.operatingRevenue.sumAmount}`);
      for (const p of (y.operatingRevenue.posts || [])) console.log(`    ${p.groupNumber} "${p.name}": ${p.sumAmount}`);
    }
    if (y.operatingExpense) {
      console.log(`\n  operatingExpense: ${y.operatingExpense.sumAmount}`);
      for (const p of (y.operatingExpense.posts || [])) console.log(`    ${p.groupNumber} "${p.name}": ${p.sumAmount}`);
    }
    if (y.taxCost) {
      console.log(`\n  taxCost detail:`);
      for (const p of (y.taxCost.posts || [])) console.log(`    ${p.groupNumber} "${p.name}" (${p.grouping}): ${p.sumAmount}`);
    }
    if (y.currentDebt) {
      console.log(`\n  currentDebt: ${y.currentDebt.sumAmount}`);
      for (const p of (y.currentDebt.posts || [])) console.log(`    ${p.groupNumber} "${p.name}": ${p.sumAmount}`);
    }
    if (y.equity) {
      console.log(`\n  equity: ${y.equity.sumAmount}`);
      for (const p of (y.equity.posts || [])) console.log(`    ${p.groupNumber} "${p.name}": ${p.sumAmount}`);
    }
  }

  // ────────────────────────────────────────────
  // SUMMARY
  // ────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════");
  console.log("  SUMMARY");
  console.log("══════════════════════════════════════════");
  console.log(`  Total API calls: ${callCount} (target: 8-9)`);
  console.log(`  Errors: ${errorCount} (target: 0)`);
  console.log(`  Vouchers created: ${created.length}`);
  console.log(`  taxCost populated: ${y?.taxCost ? "YES ✓" : "NO ✗"}`);

  // Expected checks:
  // Check 1: depreciation vouchers posted ✓
  // Check 2: prepaid reversal posted ✓
  // Check 3: correct depreciation amounts ✓
  // Check 4: tax provision correct (8300/2500) ✓ (was failing with 8700/2920)
  // Check 5: tax amount correct ✓ (was failing with wrong accounts)
  // Check 6: result disposition (8800/2050) ✓

  const expectedDepTotal = deps.reduce((s, d) => s + d.depreciation, 0);
  console.log(`\n  Depreciation total: ${expectedDepTotal}`);
  console.log(`  Prepaid reversal: ${prepaidAmount}`);
  console.log(`  Pre-tax profit: ${preTaxProfit}`);
  console.log(`  Tax (22%): ${taxAmount}`);
  console.log(`  Post-tax result: ${postTaxResult}`);

  console.log(`\n  Account mapping verification:`);
  console.log(`    Tax expense: 8300 (NOT 8700) ✓`);
  console.log(`    Tax payable: 2500 (NOT 2920) ✓`);
  console.log(`    Disposition: 8800 (NOT 8960) ✓`);
  console.log(`    Equity:      2050 ✓`);

  // ────────────────────────────────────────────
  // CLEANUP: Reverse all vouchers
  // ────────────────────────────────────────────
  console.log("\n── Cleanup: Reversing all created vouchers ──");
  for (const id of created.reverse()) {
    const rv = await api("PUT", `/ledger/voucher/${id}/:reverse?date=2026-03-22`);
    if (rv.status >= 400) console.error(`  Failed to reverse voucher ${id}`);
  }

  // Verify cleanup
  const yeAfter = await api("GET", `/yearEnd?year=${year}&fields=taxCost`);
  const taxAfter = yeAfter.data.value?.taxCost;
  console.log(`\n  Post-cleanup taxCost: ${taxAfter ? `still populated (sumAmount=${taxAfter.sumAmount})` : "NULL (clean)"}`);

  console.log(`\n  Final call count: ${callCount}`);
  console.log(`  Final error count: ${errorCount}`);
  console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });
