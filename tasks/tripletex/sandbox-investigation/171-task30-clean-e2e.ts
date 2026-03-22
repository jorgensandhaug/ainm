/**
 * Task 30 — Clean sandbox E2E test of year-end closing with 8300/2500 tax accounts.
 *
 * Steps:
 * 1. Check current BS to see if we have profit or loss
 * 2. If we need revenue to test the profitable path, create it on a non-VAT account
 * 3. Run the exact trusted-standard flow: 3 dep + 1 prepaid + BS read + tax + disposition
 * 4. Verify yearEnd API shows taxCost populated
 * 5. Clean up all created vouchers
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
  const createdVoucherIds: number[] = [];

  // ============ STEP 0: Check current BS state ============
  console.log("=== STEP 0: Current balance sheet (3000-8299) ===");
  const bsCurrent = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8299&fields=*,account(number,name)&count=1000");
  let currentSum = 0;
  for (const row of (bsCurrent.data.values || [])) {
    if (Math.abs(row.balanceOut) > 0.01) {
      console.log(`  ${row.account?.number} "${row.account?.name}": ${row.balanceOut}`);
      currentSum += row.balanceOut;
    }
  }
  const currentProfit = -currentSum;
  console.log(`  Current pre-tax profit (before our entries): ${currentProfit}`);

  // We need revenue to ensure profit AFTER our depreciation + prepaid entries
  // Our test entries: dep1=27230 + dep2=55635.71 + dep3=54450 + prepaid=55250 = total expenses = 192565.71
  // Need: currentProfit + revenue > 192565.71 so tax > 0
  const totalExpenses = 192565.71;
  const neededRevenue = Math.max(0, totalExpenses - currentProfit + 100000); // 100k buffer
  console.log(`  Need additional revenue: ${neededRevenue}`);

  // ============ STEP 0b: Create revenue if needed (using non-VAT account 3900) ============
  if (neededRevenue > 0) {
    console.log("\n=== STEP 0b: CREATE REVENUE ===");
    // Find accounts: 3900 (non-VAT revenue), 1390 (Andre fordringer — no bank recon or customer req)
    const revAcctRes = await api("GET", "/ledger/account?number=3900,1390&fields=id,number,name");
    const revAccts: Record<number, number> = {};
    for (const a of (revAcctRes.data.values || [])) {
      revAccts[a.number] = a.id;
      console.log(`  ${a.number}: "${a.name}" id=${a.id}`);
    }

    // Create missing accounts
    for (const [num, name] of [[3900, "Annen driftsrelatert inntekt"], [1390, "Andre fordringer"]] as const) {
      if (!revAccts[num]) {
        const created = await api("POST", "/ledger/account", { number: num, name });
        if (created.ok) {
          revAccts[num] = created.data.value.id;
          console.log(`  Created ${num}: id=${created.data.value.id}`);
        } else {
          console.log(`  Failed to create ${num}: ${JSON.stringify(created.data).slice(0, 200)}`);
        }
      }
    }

    const revVoucher = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "TEST Revenue for year-end E2E",
      postings: [
        { row: 1, account: { id: revAccts[1390] }, amountGross: neededRevenue, amountGrossCurrency: neededRevenue, description: "Andre fordringer" },
        { row: 2, account: { id: revAccts[3900] }, amountGross: -neededRevenue, amountGrossCurrency: -neededRevenue, description: "Inntekt" },
      ],
    });
    console.log(`  Revenue voucher: ${revVoucher.status} id=${revVoucher.data?.value?.id}`);
    if (revVoucher.data?.value?.id) createdVoucherIds.push(revVoucher.data.value.id);
    if (!revVoucher.ok) {
      console.log(`  ERROR: ${JSON.stringify(revVoucher.data).slice(0, 500)}`);
      return;
    }
  }

  // ============ STEP 1: ACCOUNT LOOKUP (mirrors trusted standard exactly) ============
  console.log("\n=== STEP 1: ACCOUNT LOOKUP ===");
  const allAcctNums = "1209,6010,1700,6300,7500,8300,2500,8800,2050";
  const acctRes = await api("GET", `/ledger/account?number=${allAcctNums}&fields=id,number,name`);
  const acctMap: Record<number, { id: number; name: string }> = {};
  for (const a of (acctRes.data.values || [])) {
    acctMap[a.number] = { id: a.id, name: a.name };
    console.log(`  ${a.number}: "${a.name}" id=${a.id}`);
  }

  // Determine prepaid contra from 1700 name
  const name1700 = acctMap[1700]?.name || "";
  let contraNum = 6300; // default
  if (name1700.toLowerCase().includes("forsikring")) contraNum = 7500;
  console.log(`  1700="${name1700}" → contra=${contraNum}`);

  // Create missing accounts
  const needed = [1209, 6010, 1700, contraNum, 8300, 2500, 8800, 2050];
  const missing = needed.filter(n => !acctMap[n]);
  if (missing.length > 0) {
    console.log(`  Missing: ${missing.join(", ")}`);
    const nameMap: Record<number, string> = { 1209: "Akkumulerte avskrivninger" };
    if (missing.length === 1) {
      const c = await api("POST", "/ledger/account", { number: missing[0], name: nameMap[missing[0]] || `Account ${missing[0]}` });
      if (c.ok) acctMap[c.data.value.number] = { id: c.data.value.id, name: c.data.value.name };
    } else {
      const bodies = missing.map(n => ({ number: n, name: nameMap[n] || `Account ${n}` }));
      const c = await api("POST", "/ledger/account/list", bodies);
      if (c.ok) for (const a of c.data.values) acctMap[a.number] = { id: a.id, name: a.name };
    }
  } else {
    console.log("  All accounts exist");
  }

  // ============ STEP 2: DEPRECIATION (3 separate vouchers) ============
  console.log("\n=== STEP 2: DEPRECIATION ===");
  const assets = [
    { name: "Inventar", cost: 136150, life: 5 },
    { name: "Kjøretøy", cost: 389450, life: 7 },
    { name: "Programvare", cost: 272250, life: 5 },
  ];

  for (const a of assets) {
    const dep = r2(a.cost / a.life);
    console.log(`  ${a.name}: ${a.cost}/${a.life} = ${dep}`);
    const v = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: `Avskrivning ${a.name} 2025`,
      postings: [
        { row: 1, account: { id: acctMap[6010].id }, amountGross: dep, amountGrossCurrency: dep, description: `Avskrivning ${a.name}` },
        { row: 2, account: { id: acctMap[1209].id }, amountGross: -dep, amountGrossCurrency: -dep, description: `Akk. avskrivning ${a.name}` },
      ],
    });
    console.log(`    → ${v.status} id=${v.data?.value?.id}`);
    if (v.data?.value?.id) createdVoucherIds.push(v.data.value.id);
    if (!v.ok) console.log(`    ERROR: ${JSON.stringify(v.data).slice(0, 300)}`);
  }

  // ============ STEP 3: PREPAID REVERSAL ============
  console.log("\n=== STEP 3: PREPAID REVERSAL ===");
  const prepaidAmt = 55250;
  const prepV = await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      { row: 1, account: { id: acctMap[contraNum].id }, amountGross: prepaidAmt, amountGrossCurrency: prepaidAmt, description: "Periodisering leiekostnad" },
      { row: 2, account: { id: acctMap[1700].id }, amountGross: -prepaidAmt, amountGrossCurrency: -prepaidAmt, description: "Forskuddsbetalte kostnader" },
    ],
  });
  console.log(`  → ${prepV.status} id=${prepV.data?.value?.id}`);
  if (prepV.data?.value?.id) createdVoucherIds.push(prepV.data.value.id);

  // ============ STEP 4: BALANCE SHEET FOR TAX (post-then-read) ============
  console.log("\n=== STEP 4: BALANCE SHEET FOR TAX ===");
  const bs = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8299&fields=*,account(id,number,name)&count=1000");
  let sumBal = 0;
  for (const row of (bs.data.values || [])) {
    if (Math.abs(row.balanceOut) > 0.01) {
      console.log(`  ${row.account?.number} "${row.account?.name}": ${row.balanceOut}`);
      sumBal += row.balanceOut;
    }
  }
  const preTaxProfit = -sumBal;
  const taxAmount = Math.round(Math.max(0, preTaxProfit) * 0.22);
  console.log(`\n  sumBal=${r2(sumBal)}, preTaxProfit=${r2(preTaxProfit)}, taxAmount=${taxAmount}`);

  // ============ STEP 5: TAX VOUCHER (8300/2500) ============
  console.log("\n=== STEP 5: TAX VOUCHER (8300/2500) ===");
  if (taxAmount > 0) {
    const taxV = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Skattekostnad 2025",
      postings: [
        { row: 1, account: { id: acctMap[8300].id }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
        { row: 2, account: { id: acctMap[2500].id }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
      ],
    });
    console.log(`  → ${taxV.status} id=${taxV.data?.value?.id}`);
    if (taxV.data?.value?.id) createdVoucherIds.push(taxV.data.value.id);
    if (!taxV.ok) console.log(`  ERROR: ${JSON.stringify(taxV.data).slice(0, 300)}`);
  } else {
    console.log("  Tax is 0 (loss) — skipping tax voucher");
  }

  // ============ STEP 6: DISPOSITION (8800/2050) ============
  console.log("\n=== STEP 6: DISPOSITION ===");
  const postTaxResult = r2(preTaxProfit - taxAmount);
  console.log(`  postTaxResult=${postTaxResult}`);

  if (postTaxResult > 0) {
    const dispV = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Disponering av årsresultat 2025",
      postings: [
        { row: 1, account: { id: acctMap[8800].id }, amountGross: postTaxResult, amountGrossCurrency: postTaxResult, description: "Årsresultat" },
        { row: 2, account: { id: acctMap[2050].id }, amountGross: -postTaxResult, amountGrossCurrency: -postTaxResult, description: "Annen egenkapital" },
      ],
    });
    console.log(`  Profit disposition: ${dispV.status} id=${dispV.data?.value?.id}`);
    if (dispV.data?.value?.id) createdVoucherIds.push(dispV.data.value.id);
  } else if (postTaxResult < 0) {
    const absVal = Math.abs(postTaxResult);
    const dispV = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Disponering av årsresultat 2025",
      postings: [
        { row: 1, account: { id: acctMap[2050].id }, amountGross: absVal, amountGrossCurrency: absVal, description: "Annen egenkapital" },
        { row: 2, account: { id: acctMap[8800].id }, amountGross: -absVal, amountGrossCurrency: -absVal, description: "Årsresultat" },
      ],
    });
    console.log(`  Loss disposition: ${dispV.status} id=${dispV.data?.value?.id}`);
    if (dispV.data?.value?.id) createdVoucherIds.push(dispV.data.value.id);
  } else {
    console.log("  Zero result — no disposition");
  }

  // ============ STEP 7: VERIFY yearEnd API ============
  console.log("\n=== STEP 7: VERIFY yearEnd API ===");
  const ye = await api("GET", "/yearEnd?fields=*");
  if (ye.ok) {
    const d = ye.data.value;
    console.log(`  status: ${d.status}`);
    console.log(`  annualResult: ${d.annualResult}`);
    console.log(`  taxCost: ${JSON.stringify(d.taxCost)}`);
    if (d.taxCost?.posts?.length > 0) {
      console.log("  ✓ taxCost IS populated — 8300/2500 voucher IS visible to yearEnd API");
    } else {
      console.log("  ✗ taxCost is empty — this might indicate a problem");
    }
  }

  // ============ STEP 8: VERIFY key account balances ============
  console.log("\n=== STEP 8: KEY BALANCES (verification) ===");
  const bsFinal = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=1000&accountNumberTo=9999&fields=*,account(number,name)&count=2000");
  const keyAccounts = [1209, 1700, 6010, 6300, 8300, 2500, 8800, 2050, 3900, 1920];
  for (const row of (bsFinal.data.values || [])) {
    if (keyAccounts.includes(row.account?.number) && Math.abs(row.balanceOut) > 0.01) {
      console.log(`  ${row.account?.number} "${row.account?.name}": balOut=${row.balanceOut}`);
    }
  }

  // ============ CLEANUP ============
  console.log("\n=== CLEANUP ===");
  for (const id of createdVoucherIds.reverse()) {
    const del = await api("DELETE", `/ledger/voucher/${id}`);
    console.log(`  Delete id=${id}: ${del.status}`);
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`  Total vouchers created: ${createdVoucherIds.length}`);
  console.log(`  preTaxProfit: ${r2(preTaxProfit)}`);
  console.log(`  taxAmount: ${taxAmount} (on accounts 8300/2500)`);
  console.log(`  postTaxResult: ${postTaxResult}`);
  console.log(`  Tax voucher posted: ${taxAmount > 0 ? "YES" : "NO"}`);
}

main().catch(e => { console.error(e); process.exit(1); });
