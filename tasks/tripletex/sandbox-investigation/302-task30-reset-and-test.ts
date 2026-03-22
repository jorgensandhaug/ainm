// Step 1: Delete all year-end vouchers (2025-12-31) to reset sandbox
// Step 2: Keep the seed voucher (2025-03-15, id 609402515)
// Step 3: Run clean E2E with both tax account variants

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
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, data: json };
}

async function deleteAllYearEndVouchers() {
  console.log("=== STEP 1: DELETE ALL YEAR-END VOUCHERS ===");

  // Get all vouchers on 2025-12-31
  const res = await api("GET", "/ledger/voucher?dateFrom=2025-12-31&dateTo=2026-01-01&fields=id,number,description&count=200");
  const vouchers = res.data?.values || [];
  console.log(`Found ${vouchers.length} year-end vouchers to delete`);

  let deleted = 0;
  let failed = 0;
  for (const v of vouchers) {
    const del = await api("DELETE", `/ledger/voucher/${v.id}`);
    if (del.status === 204 || del.status === 200) {
      deleted++;
    } else {
      console.log(`  FAILED to delete voucher ${v.id} (${v.description}): ${del.status} ${JSON.stringify(del.data)}`);
      failed++;
    }
  }
  console.log(`Deleted: ${deleted}, Failed: ${failed}`);

  // Check for remaining
  if (vouchers.length === 200) {
    console.log("May have more vouchers, checking...");
    const res2 = await api("GET", "/ledger/voucher?dateFrom=2025-12-31&dateTo=2026-01-01&fields=id&count=1");
    console.log(`Remaining: ${res2.data?.fullResultSize}`);
  }
}

async function deleteAllTaxVouchers() {
  // Also delete any vouchers that might be on accounts 8300/8700 from non-12-31 dates
  console.log("\n=== STEP 1b: CHECK NON-12-31 VOUCHERS ===");
  const res = await api("GET", "/ledger/voucher?dateFrom=2025-01-01&dateTo=2025-12-31&fields=id,number,date,description&count=200");
  const vouchers = res.data?.values || [];
  console.log(`Found ${vouchers.length} non-year-end vouchers`);
  for (const v of vouchers) {
    console.log(`  ${v.id}: ${v.date} - ${v.description}`);
    // Keep the seed voucher
    if (v.description?.includes("Sandbox seed")) {
      console.log("  -> KEEPING (seed voucher)");
    } else {
      const del = await api("DELETE", `/ledger/voucher/${v.id}`);
      console.log(`  -> DELETE: ${del.status}`);
    }
  }
}

async function verifyCleanState() {
  console.log("\n=== STEP 2: VERIFY CLEAN STATE ===");

  // Check remaining vouchers
  const vouchers = await api("GET", "/ledger/voucher?dateFrom=2025-01-01&dateTo=2026-01-01&fields=id,number,date,description&count=200");
  console.log(`Remaining vouchers: ${vouchers.data?.fullResultSize}`);
  for (const v of (vouchers.data?.values || [])) {
    console.log(`  ${v.id}: ${v.date} - ${v.description}`);
  }

  // Check balance sheet (should only reflect seed data)
  const bs = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=1000&accountNumberTo=9999&fields=account(number,name),balanceOut&count=500");
  console.log("\nBalance sheet after reset:");
  for (const v of (bs.data?.values || [])) {
    if (v.balanceOut !== 0) {
      console.log(`  ${v.account.number} ${v.account.name}: ${v.balanceOut}`);
    }
  }

  // Check yearEnd
  const ye = await api("GET", "/yearEnd?year=2025&fields=*");
  console.log(`\nyearEnd status: ${ye.data?.value?.status}`);
  console.log(`yearEnd annualResult: ${ye.data?.value?.annualResult}`);
  console.log(`yearEnd taxCost.sumAmount: ${ye.data?.value?.taxCost?.sumAmount}`);
  console.log(`yearEnd operatingExpense.sumAmount: ${ye.data?.value?.operatingExpense?.sumAmount}`);

  return ye.data?.value;
}

async function runYearEndE2E(taxExpenseAccount: number, taxPayableAccount: number) {
  const label = `${taxExpenseAccount}/${taxPayableAccount}`;
  console.log(`\n=== STEP 3: YEAR-END E2E WITH TAX ${label} ===`);

  // Activate module
  console.log("\n--- Phase 0: Module activation ---");
  const mod = await api("POST", "/company/salesmodules", { name: "YEAR_END_REPORTING_AS" });
  console.log(`Module activation: ${mod.status} (201=activated, 409=already active)`);

  // Get baseline yearEnd
  const baseline = await api("GET", "/yearEnd?year=2025&fields=*");
  console.log(`Baseline annualResult: ${baseline.data?.value?.annualResult}`);
  console.log(`Baseline taxCost.sumAmount: ${baseline.data?.value?.taxCost?.sumAmount}`);

  // Phase 1: Account lookup
  console.log("\n--- Phase 1: Account lookup ---");
  const accounts = await api("GET", `/ledger/account?number=1200,1209,1210,1230,1240,1250,1700,6010,6300,7500,${taxExpenseAccount},${taxPayableAccount},8800,2050&fields=id,number,name&count=50`);

  const acctMap: Record<number, number> = {};
  const acctNames: Record<number, string> = {};
  for (const a of (accounts.data?.values || [])) {
    acctMap[a.number] = a.id;
    acctNames[a.number] = a.name;
    console.log(`  ${a.number} (${a.name}): id=${a.id}`);
  }

  // Create missing accounts
  const needed = [1200, 1209, 1210, 1230, 1240, 1250, 1700, 6010, 6300, taxExpenseAccount, taxPayableAccount, 8800, 2050];
  const missing = needed.filter(n => !acctMap[n]);
  if (missing.length > 0) {
    console.log(`\nMissing accounts: ${missing}`);
    const missingDefs: Record<number, string> = {
      1200: "Maskiner og anlegg",
      1209: "Akkumulerte avskrivninger",
      1210: "IT-utstyr",
      1230: "Kjøretøy",
      1240: "Inventar",
      1250: "Programvare",
    };
    const toCreate = missing.map(n => ({ number: n, name: missingDefs[n] || `Account ${n}` }));
    if (toCreate.length === 1) {
      const res = await api("POST", "/ledger/account", toCreate[0]);
      if (res.status === 201) {
        acctMap[toCreate[0].number] = res.data?.value?.id;
        console.log(`  Created ${toCreate[0].number}: id=${res.data?.value?.id}`);
      } else {
        console.log(`  FAILED to create ${toCreate[0].number}: ${res.status} ${JSON.stringify(res.data)}`);
      }
    } else {
      const res = await api("POST", "/ledger/account/list", toCreate);
      if (res.status === 201) {
        for (const a of (res.data?.values || [])) {
          acctMap[a.number] = a.id;
          console.log(`  Created ${a.number}: id=${a.id}`);
        }
      } else {
        console.log(`  FAILED batch create: ${res.status} ${JSON.stringify(res.data)}`);
      }
    }
  }

  // Determine prepaid contra
  const prepaidName = acctNames[1700] || "";
  let contraAcct = 6300;
  if (prepaidName.includes("forsikring")) contraAcct = 7500;
  console.log(`\n1700 name: "${prepaidName}" → contra: ${contraAcct}`);

  // Use a specific test scenario
  // Assets: IT-utstyr (382900/5yr/1210), Programvare (436000/10yr/1250), Inventar (384600/5yr/1240)
  // Prepaid: 52850 on 1700
  // Tax: 22% of taxable result

  const r2 = (v: number) => Math.round(v * 100) / 100;
  const dep1 = r2(382900 / 5);  // 76580.00
  const dep2 = r2(436000 / 10); // 43600.00
  const dep3 = r2(384600 / 5);  // 76920.00
  const prepaid = 52850;

  console.log(`\nDepreciation: ${dep1}, ${dep2}, ${dep3}`);
  console.log(`Prepaid: ${prepaid}`);

  // Phase 2: Post depreciation vouchers
  console.log("\n--- Phase 2: Depreciation vouchers ---");
  const assets = [
    { name: "IT-utstyr", amount: dep1, assetAcct: 1210 },
    { name: "Programvare", amount: dep2, assetAcct: 1250 },
    { name: "Inventar", amount: dep3, assetAcct: 1240 },
  ];

  for (const asset of assets) {
    const vRes = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: `Avskrivning ${asset.name} 2025`,
      postings: [
        { row: 1, account: { id: acctMap[6010] }, amountGross: asset.amount, amountGrossCurrency: asset.amount, description: `Avskrivning ${asset.name}` },
        { row: 2, account: { id: acctMap[1209] }, amountGross: -asset.amount, amountGrossCurrency: -asset.amount, description: `Akk. avskrivning ${asset.name}` },
      ]
    });
    console.log(`  ${asset.name}: ${vRes.status} id=${vRes.data?.value?.id}`);
    if (vRes.status !== 201) console.log(`  ERROR: ${JSON.stringify(vRes.data)}`);
  }

  // Prepaid reversal
  console.log("\n--- Phase 2b: Prepaid reversal ---");
  const prepaidRes = await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      { row: 1, account: { id: acctMap[contraAcct] }, amountGross: prepaid, amountGrossCurrency: prepaid, description: "Periodisering leiekostnad" },
      { row: 2, account: { id: acctMap[1700] }, amountGross: -prepaid, amountGrossCurrency: -prepaid, description: "Forskuddsbetalte kostnader" },
    ]
  });
  console.log(`  Prepaid: ${prepaidRes.status} id=${prepaidRes.data?.value?.id}`);

  // Phase 3: Balance sheet for tax
  console.log("\n--- Phase 3: Balance sheet for tax ---");
  const bs = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8299&fields=*,account(id,number,name)&count=1000");
  let sumBalanceOut = 0;
  for (const v of (bs.data?.values || [])) {
    if (v.balanceOut !== 0) {
      console.log(`  ${v.account.number} ${v.account.name}: ${v.balanceOut}`);
      sumBalanceOut += v.balanceOut;
    }
  }
  const preTaxProfit = -(sumBalanceOut);
  const taxAmount = Math.round(Math.max(0, preTaxProfit) * 0.22);
  const postTaxResult = r2(preTaxProfit - taxAmount);

  console.log(`\n  sumBalanceOut: ${sumBalanceOut}`);
  console.log(`  preTaxProfit: ${preTaxProfit}`);
  console.log(`  taxAmount: ${taxAmount}`);
  console.log(`  postTaxResult: ${postTaxResult}`);

  // Phase 4: Tax voucher
  if (taxAmount > 0) {
    console.log(`\n--- Phase 4: Tax voucher (${label}) ---`);
    const taxRes = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Skattekostnad 2025",
      postings: [
        { row: 1, account: { id: acctMap[taxExpenseAccount] }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
        { row: 2, account: { id: acctMap[taxPayableAccount] }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
      ]
    });
    console.log(`  Tax: ${taxRes.status} id=${taxRes.data?.value?.id}`);
    if (taxRes.status !== 201) console.log(`  ERROR: ${JSON.stringify(taxRes.data)}`);
  }

  // Phase 5: Disposition
  console.log("\n--- Phase 5: Disposition ---");
  if (postTaxResult > 0) {
    const dispRes = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Disponering av årsresultat 2025",
      postings: [
        { row: 1, account: { id: acctMap[8800] }, amountGross: postTaxResult, amountGrossCurrency: postTaxResult, description: "Årsresultat" },
        { row: 2, account: { id: acctMap[2050] }, amountGross: -postTaxResult, amountGrossCurrency: -postTaxResult, description: "Annen egenkapital" },
      ]
    });
    console.log(`  Disposition (profit): ${dispRes.status} id=${dispRes.data?.value?.id}`);
  } else if (postTaxResult < 0) {
    const dispRes = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Disponering av årsresultat 2025",
      postings: [
        { row: 1, account: { id: acctMap[2050] }, amountGross: Math.abs(postTaxResult), amountGrossCurrency: Math.abs(postTaxResult), description: "Annen egenkapital" },
        { row: 2, account: { id: acctMap[8800] }, amountGross: -Math.abs(postTaxResult), amountGrossCurrency: -Math.abs(postTaxResult), description: "Årsresultat" },
      ]
    });
    console.log(`  Disposition (loss): ${dispRes.status} id=${dispRes.data?.value?.id}`);
  } else {
    console.log(`  Skipping disposition (zero result)`);
  }

  // Phase 6: Final verification
  console.log("\n--- Phase 6: Final verification ---");
  const yeAfter = await api("GET", "/yearEnd?year=2025&fields=*");
  const ye = yeAfter.data?.value;
  console.log(`\nyearEnd AFTER (${label}):`);
  console.log(`  status: ${ye?.status}`);
  console.log(`  annualResult: ${ye?.annualResult}`);
  console.log(`  taxCost.sumAmount: ${ye?.taxCost?.sumAmount}`);
  console.log(`  taxCost posts:`);
  for (const p of (ye?.taxCost?.posts || [])) {
    console.log(`    groupNumber: ${p.groupNumber}, grouping: ${p.grouping}, sumAmount: ${p.sumAmount}`);
  }
  console.log(`  operatingExpense.sumAmount: ${ye?.operatingExpense?.sumAmount}`);
  console.log(`  yearEndReportPosting.sumAmount: ${ye?.yearEndReportPosting?.sumAmount}`);
  console.log(`  yearEndReportPosting posts: ${JSON.stringify(ye?.yearEndReportPosting?.posts)}`);
  console.log(`  equity.sumAmount: ${ye?.equity?.sumAmount}`);
  console.log(`  currentDebt.sumAmount: ${ye?.currentDebt?.sumAmount}`);

  // Check balance sheet final state
  const bsFinal = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=1000&accountNumberTo=9999&fields=account(number,name),balanceOut&count=500");
  console.log(`\nFinal balance sheet:`);
  for (const v of (bsFinal.data?.values || [])) {
    if (v.balanceOut !== 0) {
      console.log(`  ${v.account.number} ${v.account.name}: ${v.balanceOut}`);
    }
  }

  return { preTaxProfit, taxAmount, postTaxResult };
}

async function main() {
  // Step 1: Reset
  await deleteAllYearEndVouchers();

  // Check if more rounds needed
  let remaining = 1;
  while (remaining > 0) {
    const check = await api("GET", "/ledger/voucher?dateFrom=2025-12-31&dateTo=2026-01-01&fields=id,description&count=200");
    remaining = check.data?.values?.length || 0;
    if (remaining > 0) {
      console.log(`\nDeleting ${remaining} more vouchers...`);
      for (const v of check.data.values) {
        await api("DELETE", `/ledger/voucher/${v.id}`);
      }
    }
  }

  // Delete non-year-end test vouchers (keep seed)
  await deleteAllTaxVouchers();

  // Step 2: Verify clean
  await verifyCleanState();

  // Step 3: Run E2E with 8300/2500 first (matches yearEnd API groupings)
  console.log("\n\n" + "=".repeat(60));
  console.log("TEST A: Using 8300/2500 (matches yearEnd taxCost grouping)");
  console.log("=".repeat(60));
  const resultA = await runYearEndE2E(8300, 2500);

  // Now we need to see the result before resetting for test B
  // Save the yearEnd state
  console.log("\n\n>>> After Test A: preTaxProfit=" + resultA.preTaxProfit + " taxAmount=" + resultA.taxAmount);
}

main().catch(console.error);
