/**
 * Task 30 — E2E sandbox test with PROFITABLE result.
 *
 * Goal: Ensure a positive pre-tax profit so tax is actually posted (DR 8300 / CR 2500).
 * We'll POST a fake revenue entry first to create a profit, then run the full year-end flow.
 *
 * Differences from production to test:
 * 1. sendToLedger=true on all vouchers (some tasks require it explicitly)
 * 2. 8300/2500 for tax (not 8700/2920)
 * 3. 8800/2050 for disposition
 * 4. Check yearEnd API to see taxCost populated
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, ok: res.ok };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

async function main() {
  // ============ STEP 0: CLEANUP — delete all vouchers on 2025-12-31 ============
  console.log("=== CLEANUP ===");

  // Need to search by date range that includes 2025-12-31
  // The GET /ledger/voucher requires dateFrom <= dateTo and the range to be valid
  // From prior runs we know the query with dateFrom=2025-12-31&dateTo=2025-12-31 fails with 422
  // Let's try a broader range
  const vSearchRes = await api("GET", "/ledger/voucher?dateFrom=2025-12-01&dateTo=2026-01-01&fields=id,number,date,description&count=500");
  const existingVouchers = (vSearchRes.data?.values || []).filter((v: any) => v.date === "2025-12-31");
  console.log(`  Found ${existingVouchers.length} vouchers on 2025-12-31`);

  for (const v of existingVouchers) {
    const delRes = await api("DELETE", `/ledger/voucher/${v.id}`);
    console.log(`  Delete id=${v.id} "${v.description}": ${delRes.status}`);
  }

  // ============ STEP 1: ADD REVENUE to ensure positive pre-tax profit ============
  console.log("\n=== STEP 1: CREATE REVENUE (ensure profit) ===");

  // Get revenue account (3000 = Salgsinntekt)
  const revenueAcctRes = await api("GET", "/ledger/account?number=3000,1500&fields=id,number,name");
  const acctMap: Record<number, { id: number; name: string }> = {};
  for (const a of (revenueAcctRes.data.values || [])) {
    acctMap[a.number] = { id: a.id, name: a.name };
    console.log(`  ${a.number}: "${a.name}" id=${a.id}`);
  }

  // Post a large revenue voucher to ensure profit
  // We want: revenue >> depreciation + prepaid, so tax will be positive
  // Depreciation total: 27230 + 55635.71 + 54450 = 137315.71
  // Prepaid: 55250
  // Total expenses: 192565.71
  // Let's add 500000 revenue so pre-tax profit ≈ 307434.29 → tax ≈ 67636
  const revenueVoucher = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2025-12-31",
    description: "TEST Revenue for year-end",
    postings: [
      { row: 1, account: { id: acctMap[1500]?.id || acctMap[3000]?.id }, amountGross: 500000, amountGrossCurrency: 500000, description: "Kundefordring" },
      { row: 2, account: { id: acctMap[3000].id }, amountGross: -500000, amountGrossCurrency: -500000, description: "Salgsinntekt" },
    ],
  });
  console.log(`  Revenue voucher: ${revenueVoucher.status} id=${revenueVoucher.data?.value?.id}`);
  const revenueVoucherId = revenueVoucher.data?.value?.id;

  // ============ STEP 2: ACCOUNT LOOKUP ============
  console.log("\n=== STEP 2: ACCOUNT LOOKUP ===");

  const allAcctNums = "1209,6010,1700,6300,7500,8300,2500,8800,2050";
  const acctRes = await api("GET", `/ledger/account?number=${allAcctNums}&fields=id,number,name,type`);
  for (const a of (acctRes.data.values || [])) {
    acctMap[a.number] = { id: a.id, name: a.name };
    console.log(`  ${a.number}: "${a.name}" id=${a.id}`);
  }

  const name1700 = acctMap[1700]?.name || "";
  let contraNum = 6300;
  if (name1700.toLowerCase().includes("forsikring")) contraNum = 7500;
  console.log(`  1700 name: "${name1700}" → contra: ${contraNum}`);

  // Create missing accounts
  const needed = [1209, 6010, 1700, contraNum, 8300, 2500, 8800, 2050];
  const missing = needed.filter(n => !acctMap[n]);
  if (missing.length === 1) {
    const created = await api("POST", "/ledger/account", { number: missing[0], name: "Akkumulerte avskrivninger" });
    if (created.ok) {
      acctMap[created.data.value.number] = { id: created.data.value.id, name: created.data.value.name };
      console.log(`  Created: ${created.data.value.number} id=${created.data.value.id}`);
    }
  } else if (missing.length > 1) {
    const nameMap: Record<number, string> = { 1209: "Akkumulerte avskrivninger" };
    const bodies = missing.map(n => ({ number: n, name: nameMap[n] || `Account ${n}` }));
    const created = await api("POST", "/ledger/account/list", bodies);
    if (created.ok) {
      for (const a of created.data.values) acctMap[a.number] = { id: a.id, name: a.name };
    }
  }
  console.log(`  Missing: ${missing.length ? missing.join(", ") : "none"}`);

  // ============ STEP 3: DEPRECIATION VOUCHERS (3 separate) ============
  console.log("\n=== STEP 3: DEPRECIATION ===");

  const assets = [
    { name: "Inventar", cost: 136150, life: 5 },
    { name: "Kjøretøy", cost: 389450, life: 7 },
    { name: "Programvare", cost: 272250, life: 5 },
  ];
  const deps = assets.map(a => ({ ...a, dep: r2(a.cost / a.life) }));

  const voucherIds: number[] = [];
  for (const d of deps) {
    console.log(`  ${d.name}: ${d.cost} / ${d.life} = ${d.dep}`);
    const v = await api("POST", "/ledger/voucher?sendToLedger=true", {
      date: "2025-12-31",
      description: `Avskrivning ${d.name} 2025`,
      postings: [
        { row: 1, account: { id: acctMap[6010].id }, amountGross: d.dep, amountGrossCurrency: d.dep, description: `Avskrivning ${d.name}` },
        { row: 2, account: { id: acctMap[1209].id }, amountGross: -d.dep, amountGrossCurrency: -d.dep, description: `Akk. avskrivning ${d.name}` },
      ],
    });
    console.log(`  → ${v.status} id=${v.data?.value?.id}`);
    if (v.data?.value?.id) voucherIds.push(v.data.value.id);
  }

  // ============ STEP 4: PREPAID REVERSAL ============
  console.log("\n=== STEP 4: PREPAID REVERSAL ===");

  const prepaidAmt = 55250;
  const prepaidV = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2025-12-31",
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      { row: 1, account: { id: acctMap[contraNum].id }, amountGross: prepaidAmt, amountGrossCurrency: prepaidAmt, description: "Periodisering leiekostnad" },
      { row: 2, account: { id: acctMap[1700].id }, amountGross: -prepaidAmt, amountGrossCurrency: -prepaidAmt, description: "Forskuddsbetalte kostnader" },
    ],
  });
  console.log(`  → ${prepaidV.status} id=${prepaidV.data?.value?.id}`);
  if (prepaidV.data?.value?.id) voucherIds.push(prepaidV.data.value.id);

  // ============ STEP 5: BALANCE SHEET FOR TAX ============
  console.log("\n=== STEP 5: BALANCE SHEET + TAX ===");

  const bsRes = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8299&fields=*,account(id,number,name)&count=1000");
  let sumBal = 0;
  for (const row of (bsRes.data.values || [])) {
    if (Math.abs(row.balanceOut) > 0.01) {
      console.log(`  ${row.account?.number} "${row.account?.name}": ${row.balanceOut}`);
      sumBal += row.balanceOut;
    }
  }
  const preTaxProfit = -sumBal;
  const taxAmount = Math.round(Math.max(0, preTaxProfit) * 0.22);
  console.log(`\n  Sum: ${sumBal}, preTaxProfit: ${preTaxProfit}, taxAmount: ${taxAmount}`);

  // Tax voucher
  if (taxAmount > 0) {
    const taxV = await api("POST", "/ledger/voucher?sendToLedger=true", {
      date: "2025-12-31",
      description: "Skattekostnad 2025",
      postings: [
        { row: 1, account: { id: acctMap[8300].id }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
        { row: 2, account: { id: acctMap[2500].id }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
      ],
    });
    console.log(`  Tax voucher: ${taxV.status} id=${taxV.data?.value?.id}`);
    if (taxV.data?.value?.id) voucherIds.push(taxV.data.value.id);
  } else {
    console.log("  Tax is 0 (loss) — skipping");
  }

  // ============ STEP 6: DISPOSITION ============
  console.log("\n=== STEP 6: DISPOSITION ===");

  const postTaxResult = r2(preTaxProfit - taxAmount);
  console.log(`  postTaxResult: ${postTaxResult}`);

  if (postTaxResult > 0) {
    const dispV = await api("POST", "/ledger/voucher?sendToLedger=true", {
      date: "2025-12-31",
      description: "Disponering av årsresultat 2025",
      postings: [
        { row: 1, account: { id: acctMap[8800].id }, amountGross: postTaxResult, amountGrossCurrency: postTaxResult, description: "Årsresultat" },
        { row: 2, account: { id: acctMap[2050].id }, amountGross: -postTaxResult, amountGrossCurrency: -postTaxResult, description: "Annen egenkapital" },
      ],
    });
    console.log(`  Disposition voucher (profit): ${dispV.status} id=${dispV.data?.value?.id}`);
    if (dispV.data?.value?.id) voucherIds.push(dispV.data.value.id);
  } else if (postTaxResult < 0) {
    const absVal = Math.abs(postTaxResult);
    const dispV = await api("POST", "/ledger/voucher?sendToLedger=true", {
      date: "2025-12-31",
      description: "Disponering av årsresultat 2025",
      postings: [
        { row: 1, account: { id: acctMap[2050].id }, amountGross: absVal, amountGrossCurrency: absVal, description: "Annen egenkapital" },
        { row: 2, account: { id: acctMap[8800].id }, amountGross: -absVal, amountGrossCurrency: -absVal, description: "Årsresultat" },
      ],
    });
    console.log(`  Disposition voucher (loss): ${dispV.status} id=${dispV.data?.value?.id}`);
    if (dispV.data?.value?.id) voucherIds.push(dispV.data.value.id);
  }

  // ============ STEP 7: VERIFY yearEnd API ============
  console.log("\n=== STEP 7: VERIFY yearEnd API ===");

  const ye = await api("GET", "/yearEnd?fields=*");
  if (ye.status < 400) {
    const d = ye.data.value;
    console.log(`  annualResult: ${d.annualResult}`);
    console.log(`  taxCost: ${JSON.stringify(d.taxCost)}`);

    const sections = ["operatingRevenue", "operatingExpense", "capitalIncome", "capitalCost",
                      "extraordinaryRevenue", "extraordinaryCost", "taxCost",
                      "fixedAsset", "currentAsset", "equity", "longTermDebt", "currentDebt"];
    for (const s of sections) {
      if (d[s]) {
        console.log(`\n  ${s}: sumAmount=${d[s].sumAmount}`);
        for (const p of d[s].posts || []) {
          console.log(`    ${p.groupNumber} "${p.name}" grouping=${p.grouping}: ${p.sumAmount}`);
        }
      }
    }

    // Check yearEndReportPosting
    if (d.yearEndReportPosting) {
      console.log(`\n  yearEndReportPosting: ${JSON.stringify(d.yearEndReportPosting).slice(0, 500)}`);
    }

    // Check annualResult matches our calculation
    console.log(`\n  Our postTaxResult: ${postTaxResult}`);
    console.log(`  yearEnd annualResult: ${d.annualResult}`);
    console.log(`  Match: ${Math.abs(d.annualResult - (-postTaxResult)) < 1 ? "YES" : "NO (MISMATCH!)"}`);
  }

  // ============ STEP 8: VERIFY key account balances ============
  console.log("\n=== STEP 8: KEY BALANCES ===");

  const keyAccounts = [1209, 1700, 6010, 6300, 8300, 2500, 8800, 2050, 3000, 1500];
  const bsAll = await api("GET", `/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=1000&accountNumberTo=9999&fields=*,account(number,name)&count=2000`);
  for (const row of (bsAll.data.values || [])) {
    if (keyAccounts.includes(row.account?.number) || Math.abs(row.balanceOut) > 0.01) {
      console.log(`  ${row.account?.number} "${row.account?.name}": balOut=${row.balanceOut}`);
    }
  }

  // ============ STEP 9: CLEANUP — delete all test vouchers ============
  console.log("\n=== STEP 9: CLEANUP ===");

  // Delete in reverse order
  if (revenueVoucherId) voucherIds.unshift(revenueVoucherId);
  for (const id of voucherIds.reverse()) {
    const del = await api("DELETE", `/ledger/voucher/${id}`);
    console.log(`  Delete id=${id}: ${del.status}`);
  }

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error(e); process.exit(1); });
