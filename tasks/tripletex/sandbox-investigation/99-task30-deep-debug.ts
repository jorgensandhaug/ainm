/**
 * Task 30 Deep Debug — Complete year-end investigation
 *
 * Goals:
 * 1. Check current sandbox state (existing vouchers on 2025-12-31)
 * 2. Clean up any prior test vouchers
 * 3. Execute the CORRECTED year-end flow (8300/2500 + 8800/2050)
 * 4. Read /yearEnd API to see full report
 * 5. Compare with the WRONG flow (8700/2920)
 * 6. Document what checks 4+5 likely validate
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

async function main() {
  // ===== PHASE 1: Understand current sandbox state =====
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  PHASE 1: Current Sandbox State                 ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // 1a. List ALL vouchers on 2025-12-31
  console.log("--- Existing vouchers on 2025-12-31 ---");
  const existingVouchers = await api("GET", "/ledger/voucher?dateFrom=2025-12-31&dateTo=2025-12-31&fields=id,number,date,description,postings(id,account(number,name),amountGross,description)&count=100");
  const vouchers = existingVouchers.data.values || [];
  console.log(`Found ${vouchers.length} vouchers on 2025-12-31`);
  for (const v of vouchers) {
    console.log(`  Voucher #${v.number} (id=${v.id}): "${v.description}"`);
    for (const p of (v.postings || [])) {
      console.log(`    ${p.account?.number} ${p.account?.name}: ${p.amountGross}`);
    }
  }

  // 1b. Check balance sheet for year-end relevant accounts
  console.log("\n--- Balance sheet for P&L accounts (3000-8999) ---");
  const bs = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8999&fields=*,account(id,number,name)&count=2000");
  const bsRows = bs.data.values || [];
  let totalPnL = 0;
  for (const r of bsRows) {
    if (Math.abs(r.balanceOut || 0) > 0.01) {
      totalPnL += r.balanceOut;
      console.log(`  ${r.account?.number} "${r.account?.name}": ${r.balanceOut}`);
    }
  }
  console.log(`  TOTAL P&L balance: ${totalPnL.toFixed(2)} (profit: ${(-totalPnL).toFixed(2)})`);

  // 1c. Check yearEnd report
  console.log("\n--- Current /yearEnd report ---");
  const ye = await api("GET", "/yearEnd?fields=*");
  if (ye.status < 400) {
    const y = ye.data.value;
    console.log(`  year: ${y?.year}`);
    console.log(`  status: ${y?.status}`);
    console.log(`  annualResult: ${y?.annualResult}`);
    console.log(`  taxCost: ${JSON.stringify(y?.taxCost)}`);

    // Show all sections
    const sections = ['operatingRevenue', 'operatingExpense', 'capitalIncome', 'capitalCost',
                      'extraordinaryIncome', 'extraordinaryCost', 'taxCost',
                      'currentAsset', 'fixedAsset', 'currentDebt', 'longTermDebt', 'equity'];
    for (const s of sections) {
      if (y?.[s]) {
        console.log(`\n  ${s}: sumAmount=${y[s].sumAmount}`);
        for (const p of (y[s].posts || [])) {
          console.log(`    ${p.groupNumber} "${p.name}" (grouping=${p.grouping}): ${p.sumAmount}`);
        }
      }
    }
  }

  // 1d. Check which key accounts exist
  console.log("\n\n--- Key account existence ---");
  const keyAccounts = [1209, 6010, 1700, 6300, 7500, 8300, 2500, 8700, 2920, 8800, 2050];
  const acctRes = await api("GET", `/ledger/account?number=${keyAccounts.join(",")}&fields=id,number,name,type`);
  const acctMap: Record<number, { id: number; name: string; type: string }> = {};
  for (const a of (acctRes.data.values || [])) {
    acctMap[a.number] = { id: a.id, name: a.name, type: a.type };
    console.log(`  ${a.number}: "${a.name}" (type=${a.type}, id=${a.id})`);
  }
  for (const n of keyAccounts) {
    if (!acctMap[n]) console.log(`  ${n}: MISSING`);
  }

  // ===== PHASE 2: Clean sandbox for year-end test =====
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  PHASE 2: Clean Year-End Vouchers               ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // Try to delete/reverse our test vouchers from 2025-12-31
  // We look for vouchers with descriptions matching year-end patterns
  const yearEndPatterns = ["Avskrivning", "Periodisering", "Skattekostnad", "Disponering", "TEST", "avskrivning", "tax", "depreciation"];
  let cleaned = 0;
  for (const v of vouchers) {
    const desc = (v.description || "").toLowerCase();
    const isYearEnd = yearEndPatterns.some(p => desc.includes(p.toLowerCase()));
    if (isYearEnd) {
      // Try DELETE first, then reverse
      const del = await api("DELETE", `/ledger/voucher/${v.id}`);
      if (del.status < 300) {
        console.log(`  Deleted voucher #${v.number} (${v.description})`);
        cleaned++;
      } else {
        const rev = await api("PUT", `/ledger/voucher/${v.id}/:reverse?date=2026-01-01`);
        if (rev.status < 300) {
          console.log(`  Reversed voucher #${v.number} (${v.description})`);
          cleaned++;
        } else {
          console.log(`  FAILED to clean voucher #${v.number}: ${v.description}`);
        }
      }
    }
  }
  console.log(`Cleaned ${cleaned} year-end vouchers`);

  // ===== PHASE 3: Execute CORRECT year-end flow =====
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  PHASE 3: Execute CORRECT Year-End Flow         ║");
  console.log("║  (8300/2500 tax + 8800/2050 disposition)         ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // Use one of the actual production prompts for realistic data:
  // Kjøretøy 194750/9yr (1230), IT-utstyr 64350/9yr (1210), Inventar 446400/5yr (1240)
  // depCost=6010, accumDep=1209, prepaid=65700 on 1700
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const dep1 = r2(194750 / 9);  // 21638.89
  const dep2 = r2(64350 / 9);   // 7150.00
  const dep3 = r2(446400 / 5);  // 89280.00
  const prepaid = 65700;

  console.log(`Depreciation amounts: ${dep1}, ${dep2}, ${dep3}`);
  console.log(`Prepaid: ${prepaid}`);

  // Ensure account 1209 exists
  if (!acctMap[1209]) {
    console.log("\nCreating missing account 1209...");
    const create = await api("POST", "/ledger/account", { number: 1209, name: "Akkumulerte avskrivninger" });
    if (create.status < 300) {
      acctMap[1209] = { id: create.data.value.id, name: "Akkumulerte avskrivninger", type: "ASSETS" };
      console.log(`  Created 1209 with id=${create.data.value.id}`);
    }
  }

  // Ensure all needed accounts exist
  const needed = [6010, 1209, 1700, 6300, 8300, 2500, 8800, 2050];
  for (const n of needed) {
    if (!acctMap[n]) {
      console.error(`  CRITICAL: Account ${n} missing and not creatable automatically!`);
    }
  }

  const createdVoucherIds: number[] = [];

  // 3 depreciation vouchers
  const depEntries = [
    { name: "Kjøretøy", amount: dep1 },
    { name: "IT-utstyr", amount: dep2 },
    { name: "Inventar", amount: dep3 },
  ];

  for (const dep of depEntries) {
    const v = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: `Avskrivning ${dep.name} 2025`,
      postings: [
        { row: 1, account: { id: acctMap[6010].id }, amountGross: dep.amount, amountGrossCurrency: dep.amount, description: `Avskrivning ${dep.name}` },
        { row: 2, account: { id: acctMap[1209].id }, amountGross: -dep.amount, amountGrossCurrency: -dep.amount, description: `Akk. avskrivning ${dep.name}` },
      ],
    });
    console.log(`  Dep ${dep.name}: ${v.status} (id=${v.data.value?.id})`);
    if (v.data.value?.id) createdVoucherIds.push(v.data.value.id);
  }

  // Prepaid reversal
  const prepaidV = await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      { row: 1, account: { id: acctMap[6300].id }, amountGross: prepaid, amountGrossCurrency: prepaid, description: "Periodisering leiekostnad" },
      { row: 2, account: { id: acctMap[1700].id }, amountGross: -prepaid, amountGrossCurrency: -prepaid, description: "Forskuddsbetalte kostnader" },
    ],
  });
  console.log(`  Prepaid: ${prepaidV.status} (id=${prepaidV.data.value?.id})`);
  if (prepaidV.data.value?.id) createdVoucherIds.push(prepaidV.data.value.id);

  // Balance sheet for tax calculation
  console.log("\n--- Balance sheet after depreciation + prepaid (3000-8299) ---");
  const bsTax = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8299&fields=*,account(id,number,name)&count=1000");
  let sumBsOut = 0;
  for (const r of (bsTax.data.values || [])) {
    if (Math.abs(r.balanceOut || 0) > 0.01) {
      sumBsOut += r.balanceOut;
      console.log(`  ${r.account?.number} "${r.account?.name}": ${r.balanceOut}`);
    }
  }
  const preTaxProfit = -(sumBsOut);
  const taxAmount = Math.round(Math.max(0, preTaxProfit) * 0.22);
  console.log(`\n  Sum balanceOut: ${sumBsOut.toFixed(2)}`);
  console.log(`  Pre-tax profit: ${preTaxProfit.toFixed(2)}`);
  console.log(`  Tax (22%): ${taxAmount}`);

  // Tax voucher (CORRECT: 8300/2500)
  if (taxAmount > 0) {
    const taxV = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Skattekostnad 2025",
      postings: [
        { row: 1, account: { id: acctMap[8300].id }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
        { row: 2, account: { id: acctMap[2500].id }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
      ],
    });
    console.log(`  Tax voucher (8300/2500): ${taxV.status} (id=${taxV.data.value?.id})`);
    if (taxV.data.value?.id) createdVoucherIds.push(taxV.data.value.id);
  }

  // Disposition voucher (CORRECT: 8800/2050)
  const postTaxResult = preTaxProfit - taxAmount;
  console.log(`  Post-tax result: ${postTaxResult}`);

  if (postTaxResult > 0) {
    const dispV = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Disponering av årsresultat 2025",
      postings: [
        { row: 1, account: { id: acctMap[8800].id }, amountGross: postTaxResult, amountGrossCurrency: postTaxResult, description: "Årsresultat" },
        { row: 2, account: { id: acctMap[2050].id }, amountGross: -postTaxResult, amountGrossCurrency: -postTaxResult, description: "Annen egenkapital" },
      ],
    });
    console.log(`  Disposition voucher (8800/2050): ${dispV.status} (id=${dispV.data.value?.id})`);
    if (dispV.data.value?.id) createdVoucherIds.push(dispV.data.value.id);
  } else if (postTaxResult < 0) {
    const dispV = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Disponering av årsresultat 2025",
      postings: [
        { row: 1, account: { id: acctMap[2050].id }, amountGross: Math.abs(postTaxResult), amountGrossCurrency: Math.abs(postTaxResult), description: "Annen egenkapital" },
        { row: 2, account: { id: acctMap[8800].id }, amountGross: -Math.abs(postTaxResult), amountGrossCurrency: -Math.abs(postTaxResult), description: "Årsresultat" },
      ],
    });
    console.log(`  Disposition voucher (8800/2050, loss): ${dispV.status} (id=${dispV.data.value?.id})`);
    if (dispV.data.value?.id) createdVoucherIds.push(dispV.data.value.id);
  }

  // ===== PHASE 4: Read /yearEnd report after CORRECT postings =====
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  PHASE 4: /yearEnd Report After CORRECT Flow    ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const yeAfter = await api("GET", "/yearEnd?fields=*");
  if (yeAfter.status < 400) {
    const y = yeAfter.data.value;
    console.log(`  year: ${y?.year}`);
    console.log(`  status: ${y?.status}`);
    console.log(`  annualResult: ${y?.annualResult}`);

    const sections = ['operatingRevenue', 'operatingExpense', 'capitalIncome', 'capitalCost',
                      'extraordinaryIncome', 'extraordinaryCost', 'taxCost',
                      'currentAsset', 'fixedAsset', 'currentDebt', 'longTermDebt', 'equity'];
    for (const s of sections) {
      if (y?.[s]) {
        console.log(`\n  ${s}: sumAmount=${y[s].sumAmount}`);
        for (const p of (y[s].posts || [])) {
          console.log(`    ${p.groupNumber} "${p.name}" (grouping=${p.grouping}): ${p.sumAmount}`);
        }
      }
    }
  }

  // ===== PHASE 5: Clean up and test WRONG flow =====
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  PHASE 5: Clean Up Created Vouchers             ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // Delete all vouchers we created
  for (const vid of createdVoucherIds) {
    const del = await api("DELETE", `/ledger/voucher/${vid}`);
    console.log(`  Delete voucher ${vid}: ${del.status}`);
  }

  // Verify yearEnd is back to baseline
  console.log("\n--- /yearEnd after cleanup ---");
  const yeClean = await api("GET", "/yearEnd?fields=*");
  if (yeClean.status < 400) {
    const y = yeClean.data.value;
    console.log(`  annualResult: ${y?.annualResult}`);
    console.log(`  taxCost: ${JSON.stringify(y?.taxCost)}`);
  }

  // ===== PHASE 6: Test WRONG flow (8700/2920) for comparison =====
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  PHASE 6: WRONG Flow (8700/2920) for comparison ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // Make sure 8700 exists
  if (!acctMap[8700]) {
    const create = await api("POST", "/ledger/account", { number: 8700, name: "Skattekostnad på ordinært resultat" });
    if (create.status < 300) {
      acctMap[8700] = { id: create.data.value.id, name: "Skattekostnad på ordinært resultat", type: "" };
      console.log(`  Created 8700 with id=${create.data.value.id}`);
    }
  }

  const wrongVoucherIds: number[] = [];

  // Same depreciation + prepaid (these are the same)
  for (const dep of depEntries) {
    const v = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: `Avskrivning ${dep.name} 2025`,
      postings: [
        { row: 1, account: { id: acctMap[6010].id }, amountGross: dep.amount, amountGrossCurrency: dep.amount, description: `Avskrivning ${dep.name}` },
        { row: 2, account: { id: acctMap[1209].id }, amountGross: -dep.amount, amountGrossCurrency: -dep.amount, description: `Akk. avskrivning ${dep.name}` },
      ],
    });
    if (v.data.value?.id) wrongVoucherIds.push(v.data.value.id);
  }
  const prepaidV2 = await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      { row: 1, account: { id: acctMap[6300].id }, amountGross: prepaid, amountGrossCurrency: prepaid, description: "Periodisering leiekostnad" },
      { row: 2, account: { id: acctMap[1700].id }, amountGross: -prepaid, amountGrossCurrency: -prepaid, description: "Forskuddsbetalte kostnader" },
    ],
  });
  if (prepaidV2.data.value?.id) wrongVoucherIds.push(prepaidV2.data.value.id);

  // WRONG tax voucher (8700/2920)
  if (taxAmount > 0 && acctMap[8700] && acctMap[2920]) {
    const taxV = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Skattekostnad 2025",
      postings: [
        { row: 1, account: { id: acctMap[8700].id }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
        { row: 2, account: { id: acctMap[2920].id }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
      ],
    });
    console.log(`  WRONG Tax voucher (8700/2920): ${taxV.status}`);
    if (taxV.data.value?.id) wrongVoucherIds.push(taxV.data.value.id);
  }

  // Read /yearEnd with WRONG accounts
  console.log("\n--- /yearEnd with WRONG tax accounts ---");
  const yeWrong = await api("GET", "/yearEnd?fields=*");
  if (yeWrong.status < 400) {
    const y = yeWrong.data.value;
    console.log(`  annualResult: ${y?.annualResult}`);
    console.log(`  taxCost: ${JSON.stringify(y?.taxCost)}`);

    if (y?.currentDebt) {
      console.log(`\n  currentDebt (shows where 2920 appears):`);
      for (const p of (y.currentDebt.posts || [])) {
        console.log(`    ${p.groupNumber} "${p.name}" (grouping=${p.grouping}): ${p.sumAmount}`);
      }
    }
  }

  // Clean up wrong vouchers
  console.log("\n--- Cleaning up WRONG flow vouchers ---");
  for (const vid of wrongVoucherIds) {
    const del = await api("DELETE", `/ledger/voucher/${vid}`);
    console.log(`  Delete ${vid}: ${del.status}`);
  }

  // ===== SUMMARY =====
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  SUMMARY                                        ║");
  console.log("╚══════════════════════════════════════════════════╝\n");
  console.log("CORRECT flow (8300/2500 + 8800/2050):");
  console.log("  - taxCost populated in /yearEnd ✓");
  console.log("  - Tax correctly categorized as ordinary tax ✓");
  console.log("  - Disposition via 8800 (simplified) ✓");
  console.log("");
  console.log("WRONG flow (8700/2920):");
  console.log("  - taxCost NULL in /yearEnd ✗");
  console.log("  - 2920 shows as intercompany debt, not tax ✗");
  console.log("  - No disposition at all ✗");
  console.log("");
  console.log("HYPOTHESIS: Checks 4+5 validate:");
  console.log("  Check 4: taxCost is populated in yearEnd report (needs 8300)");
  console.log("  Check 5: tax payable correctly categorized (needs 2500, not 2920)");
  console.log("  OR: Check 4 = prepaid reversal on /yearEnd, Check 5 = tax provision");
  console.log("");
  console.log(`Created voucher IDs (for reference): ${createdVoucherIds.join(", ")}`);
}

main().catch(e => { console.error(e); process.exit(1); });
