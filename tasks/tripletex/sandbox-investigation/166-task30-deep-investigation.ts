/**
 * Task 30 deep investigation:
 * 1. Check current sandbox state (existing vouchers, yearEnd API)
 * 2. Clean up any prior year-end vouchers
 * 3. Run full 9-call flow with known values (matching latest prod prompt)
 * 4. Inspect yearEnd API in detail to understand what checks 4+5 might validate
 * 5. Check all balance sheet / ledger states
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
  if (!res.ok && method !== "DELETE") {
    console.error(`  ${method} ${path} → ${res.status}: ${typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200)}`);
  }
  return { status: res.status, data };
}

async function main() {
  // ============ PHASE 0: CHECK CURRENT STATE ============
  console.log("═══ PHASE 0: CURRENT STATE ═══\n");

  // 0a. List all vouchers on 2025-12-31
  console.log("--- Vouchers on 2025-12-31 ---");
  const vRes = await api("GET", "/ledger/voucher?dateFrom=2025-12-31&dateTo=2025-12-31&fields=id,number,date,description&count=200");
  const vouchers = vRes.data.values || [];
  console.log(`  Found ${vouchers.length} vouchers`);
  for (const v of vouchers) {
    console.log(`  id=${v.id} #${v.number} "${v.description}"`);
  }

  // 0b. Check yearEnd API
  console.log("\n--- Year-end API (BEFORE cleanup) ---");
  let ye = await api("GET", "/yearEnd?fields=*");
  if (ye.status < 400) {
    const d = ye.data.value;
    console.log(`  annualResult: ${d.annualResult}`);
    console.log(`  taxCost: ${JSON.stringify(d.taxCost)}`);
    if (d.operatingExpense) {
      console.log("  operatingExpense posts:");
      for (const p of d.operatingExpense.posts || []) {
        console.log(`    ${p.groupNumber} "${p.name}" grouping=${p.grouping}: ${p.sumAmount}`);
      }
    }
    if (d.currentDebt) {
      console.log("  currentDebt posts:");
      for (const p of d.currentDebt.posts || []) {
        console.log(`    ${p.groupNumber} "${p.name}" grouping=${p.grouping}: ${p.sumAmount}`);
      }
    }
    if (d.equity) {
      console.log("  equity posts:");
      for (const p of d.equity.posts || []) {
        console.log(`    ${p.groupNumber} "${p.name}" grouping=${p.grouping}: ${p.sumAmount}`);
      }
    }
  }

  // ============ PHASE 1: CLEANUP ============
  console.log("\n═══ PHASE 1: CLEANUP ═══\n");

  // Delete all vouchers on 2025-12-31 that look like year-end entries
  const yearEndKeywords = ["avskrivning", "periodisering", "skattekostnad", "disponering", "årsresultat", "test", "depreciation", "tax"];
  let deleted = 0;
  for (const v of vouchers) {
    const desc = (v.description || "").toLowerCase();
    const isYearEnd = yearEndKeywords.some(kw => desc.includes(kw));
    if (isYearEnd) {
      const delRes = await api("DELETE", `/ledger/voucher/${v.id}`);
      if (delRes.status < 400) {
        console.log(`  Deleted: id=${v.id} "${v.description}"`);
        deleted++;
      } else {
        console.log(`  FAILED to delete id=${v.id} "${v.description}" → ${delRes.status}`);
      }
    }
  }
  console.log(`  Deleted ${deleted} vouchers`);

  // Re-check yearEnd after cleanup
  console.log("\n--- Year-end API (AFTER cleanup) ---");
  ye = await api("GET", "/yearEnd?fields=*");
  if (ye.status < 400) {
    const d = ye.data.value;
    console.log(`  annualResult: ${d.annualResult}`);
    console.log(`  taxCost: ${JSON.stringify(d.taxCost)}`);
  }

  // ============ PHASE 2: ACCOUNT LOOKUP ============
  console.log("\n═══ PHASE 2: ACCOUNT SETUP ═══\n");

  // Using latest prod prompt values:
  // Inventar (136150, 5yr, 1240), Kjøretøy (389450, 7yr, 1230), Programvare (272250, 5yr, 1250)
  // Prepaid: 55250 on 1700
  // Tax: 22% on 8300/2500
  // Disposition: 8800/2050

  const r2 = (v: number) => Math.round(v * 100) / 100;
  const assets = [
    { name: "Inventar", cost: 136150, life: 5 },
    { name: "Kjøretøy", cost: 389450, life: 7 },
    { name: "Programvare", cost: 272250, life: 5 },
  ];
  const deps = assets.map(a => ({ ...a, dep: r2(a.cost / a.life) }));
  for (const d of deps) {
    console.log(`  ${d.name}: ${d.cost} / ${d.life} = ${d.dep}`);
  }

  const prepaidAmt = 55250;
  const YEAR = "2025";
  const DATE = `${YEAR}-12-31`;

  // GET all accounts including asset accounts (to check what exists)
  const allAcctNums = "1200,1209,1210,1230,1240,1250,1700,6010,6300,7500,8300,2500,8800,2050,8700,2920";
  const acctRes = await api("GET", `/ledger/account?number=${allAcctNums}&fields=id,number,name,type`);
  const accts: Record<number, { id: number; name: string; type: string }> = {};
  for (const a of (acctRes.data.values || [])) {
    accts[a.number] = { id: a.id, name: a.name, type: a.type };
    console.log(`  ${a.number}: "${a.name}" type=${a.type} id=${a.id}`);
  }

  // Check 1700 name for contra mapping
  const name1700 = accts[1700]?.name || "";
  let contraNum = 6300;
  if (name1700.toLowerCase().includes("forsikring")) contraNum = 7500;
  console.log(`\n  1700 name: "${name1700}" → contra: ${contraNum}`);

  // Create missing accounts
  const needed = [1209, 6010, 1700, contraNum, 8300, 2500, 8800, 2050];
  const missing = needed.filter(n => !accts[n]);
  console.log(`  Missing: ${missing.length ? missing.join(", ") : "none"}`);

  if (missing.length === 1) {
    const nameMap: Record<number, string> = { 1209: "Akkumulerte avskrivninger" };
    const body = { number: missing[0], name: nameMap[missing[0]] || `Account ${missing[0]}` };
    const r = await api("POST", "/ledger/account", body);
    if (r.status === 201) {
      accts[r.data.value.number] = { id: r.data.value.id, name: r.data.value.name, type: r.data.value.type };
      console.log(`  Created: ${r.data.value.number} id=${r.data.value.id}`);
    }
  } else if (missing.length > 1) {
    const nameMap: Record<number, string> = { 1209: "Akkumulerte avskrivninger" };
    const bodies = missing.map(n => ({ number: n, name: nameMap[n] || `Account ${n}` }));
    const r = await api("POST", "/ledger/account/list", bodies);
    if (r.status === 201) {
      for (const a of r.data.values) {
        accts[a.number] = { id: a.id, name: a.name, type: a.type };
        console.log(`  Created: ${a.number} id=${a.id}`);
      }
    }
  }

  // ============ PHASE 3: POST VOUCHERS ============
  console.log("\n═══ PHASE 3: POST VOUCHERS ═══\n");

  async function postVoucher(description: string, postings: any[]) {
    const body = { date: DATE, description, postings };
    const r = await api("POST", "/ledger/voucher", body);
    if (r.status === 201) {
      console.log(`  ✓ "${description}" → id=${r.data.value.id}`);
      return r.data.value;
    } else {
      console.error(`  ✗ "${description}" → ${r.status}`);
      return null;
    }
  }

  // 3 depreciation vouchers
  for (const d of deps) {
    await postVoucher(`Avskrivning ${d.name} ${YEAR}`, [
      { row: 1, account: { id: accts[6010].id }, amountGross: d.dep, amountGrossCurrency: d.dep, description: `Avskrivning ${d.name}` },
      { row: 2, account: { id: accts[1209].id }, amountGross: -d.dep, amountGrossCurrency: -d.dep, description: `Akk. avskrivning ${d.name}` },
    ]);
  }

  // Prepaid reversal
  await postVoucher("Periodisering forskuddsbetalte kostnader", [
    { row: 1, account: { id: accts[contraNum].id }, amountGross: prepaidAmt, amountGrossCurrency: prepaidAmt, description: "Periodisering leiekostnad" },
    { row: 2, account: { id: accts[1700].id }, amountGross: -prepaidAmt, amountGrossCurrency: -prepaidAmt, description: "Forskuddsbetalte kostnader" },
  ]);

  // ============ PHASE 4: BALANCE SHEET + TAX ============
  console.log("\n═══ PHASE 4: TAX CALCULATION ═══\n");

  const bsRes = await api("GET", `/balanceSheet?dateFrom=${YEAR}-01-01&dateTo=${parseInt(YEAR)+1}-01-01&accountNumberFrom=3000&accountNumberTo=8299&fields=*,account(id,number,name)&count=1000`);
  let sumBal = 0;
  const bsRows: string[] = [];
  for (const row of (bsRes.data.values || [])) {
    if (Math.abs(row.balanceOut) > 0.01) {
      bsRows.push(`  ${row.account?.number} "${row.account?.name}": ${row.balanceOut}`);
      sumBal += row.balanceOut;
    }
  }
  console.log("Balance sheet 3000-8299:");
  for (const r of bsRows) console.log(r);
  const preTaxProfit = -sumBal;
  const taxAmount = Math.round(Math.max(0, preTaxProfit) * 0.22);
  console.log(`\n  Sum: ${sumBal}`);
  console.log(`  preTaxProfit: ${preTaxProfit}`);
  console.log(`  taxAmount: ${taxAmount}`);

  // Tax voucher
  if (taxAmount > 0) {
    await postVoucher(`Skattekostnad ${YEAR}`, [
      { row: 1, account: { id: accts[8300].id }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
      { row: 2, account: { id: accts[2500].id }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
    ]);
  } else {
    console.log("  Tax is 0 (loss) — skipping tax voucher");
  }

  // ============ PHASE 5: DISPOSITION ============
  console.log("\n═══ PHASE 5: DISPOSITION ═══\n");

  const postTaxResult = r2(preTaxProfit - taxAmount);
  console.log(`  postTaxResult: ${postTaxResult}`);

  if (postTaxResult > 0) {
    await postVoucher(`Disponering av årsresultat ${YEAR}`, [
      { row: 1, account: { id: accts[8800].id }, amountGross: postTaxResult, amountGrossCurrency: postTaxResult, description: "Årsresultat" },
      { row: 2, account: { id: accts[2050].id }, amountGross: -postTaxResult, amountGrossCurrency: -postTaxResult, description: "Annen egenkapital" },
    ]);
  } else if (postTaxResult < 0) {
    const absVal = Math.abs(postTaxResult);
    await postVoucher(`Disponering av årsresultat ${YEAR}`, [
      { row: 1, account: { id: accts[2050].id }, amountGross: absVal, amountGrossCurrency: absVal, description: "Annen egenkapital" },
      { row: 2, account: { id: accts[8800].id }, amountGross: -absVal, amountGrossCurrency: -absVal, description: "Årsresultat" },
    ]);
  } else {
    console.log("  postTaxResult is 0 — skipping disposition");
  }

  // ============ PHASE 6: VERIFICATION ============
  console.log("\n═══ PHASE 6: VERIFICATION ═══\n");

  // 6a. yearEnd API
  ye = await api("GET", "/yearEnd?fields=*");
  if (ye.status < 400) {
    const d = ye.data.value;
    console.log("--- yearEnd API ---");
    console.log(`  annualResult: ${d.annualResult}`);
    console.log(`  taxCost: ${JSON.stringify(d.taxCost)}`);

    // Print ALL top-level sections with their sumAmounts
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

    // Check for any fields we might be missing
    console.log("\n  All non-null yearEnd fields:", Object.keys(d).filter(k => d[k] !== null && d[k] !== undefined).join(", "));
  }

  // 6b. Balance sheet with ALL accounts to see final state
  console.log("\n--- Final balance sheet (ALL accounts) ---");
  const bsFinal = await api("GET", `/balanceSheet?dateFrom=${YEAR}-01-01&dateTo=${parseInt(YEAR)+1}-01-01&accountNumberFrom=1000&accountNumberTo=9999&fields=*,account(number,name)&count=2000`);
  for (const row of (bsFinal.data.values || [])) {
    if (Math.abs(row.balanceOut) > 0.01) {
      console.log(`  ${row.account?.number} "${row.account?.name}": balIn=${row.balanceIn} balOut=${row.balanceOut}`);
    }
  }

  // 6c. Check specific account balances
  console.log("\n--- Key account balances ---");
  const keyAccts = [1209, 1700, 6010, 6300, 8300, 2500, 8800, 2050];
  for (const num of keyAccts) {
    const bsAcct = await api("GET", `/balanceSheet?dateFrom=${YEAR}-01-01&dateTo=${parseInt(YEAR)+1}-01-01&accountNumberFrom=${num}&accountNumberTo=${num}&fields=*,account(number,name)`);
    const row = bsAcct.data.values?.[0];
    if (row) {
      console.log(`  ${num}: balIn=${row.balanceIn} balOut=${row.balanceOut}`);
    } else {
      console.log(`  ${num}: no data`);
    }
  }

  // 6d. List all vouchers on 2025-12-31 after our postings
  console.log("\n--- Final vouchers on 2025-12-31 ---");
  const vFinal = await api("GET", "/ledger/voucher?dateFrom=2025-12-31&dateTo=2025-12-31&fields=id,number,date,description&count=200");
  for (const v of (vFinal.data.values || [])) {
    console.log(`  id=${v.id} #${v.number} "${v.description}"`);
  }
  console.log(`  Total: ${(vFinal.data.values || []).length} vouchers`);

  console.log("\n═══ DONE ═══");
}

main().catch(e => { console.error(e); process.exit(1); });
