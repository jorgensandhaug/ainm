/**
 * Task 30 — Compare tax calculation methods:
 * A) Balance sheet approach (current): balanceSheet 3000-8299
 * B) yearEnd approach: GET /yearEnd → read operatingExpense/operatingRevenue
 * C) yearEnd/annualAccounts approach: ordinaryResultBeforeTaxes
 * 
 * Run a clean pipeline and compare all three numbers.
 * Also test with module activation.
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const r2 = (v: number) => Math.round(v * 100) / 100;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, ok: res.ok };
}

async function main() {
  const cleanupIds: { vouchers: number[], assets: number[] } = { vouchers: [], assets: [] };

  // === Activate modules ===
  for (const mod of ["FIXED_ASSETS_REGISTER", "YEAR_END_REPORTING_AS"]) {
    await api("POST", "/company/salesmodules", { name: mod });
  }

  // === Revenue to ensure profit ===
  const revAcctRes = await api("GET", "/ledger/account?number=1390,3900,1209,6010,1700,6300,7500,8300,2500,8800,2050,1210,1240,1250&fields=id,number,name");
  const accts: Record<number, { id: number; name: string }> = {};
  for (const a of (revAcctRes.data.values || [])) accts[a.number] = { id: a.id, name: a.name };
  
  if (!accts[1209]) {
    const c = await api("POST", "/ledger/account", { number: 1209, name: "Akkumulerte avskrivninger" });
    accts[1209] = { id: c.data.value.id, name: c.data.value.name };
  }

  // Create revenue
  const revV = await api("POST", "/ledger/voucher", {
    date: "2025-12-31", description: "Test Revenue",
    postings: [
      { row: 1, account: { id: accts[1390].id }, amountGross: 500000, amountGrossCurrency: 500000, description: "Fordring" },
      { row: 2, account: { id: accts[3900].id }, amountGross: -500000, amountGrossCurrency: -500000, description: "Inntekt" },
    ],
  });
  if (revV.ok) cleanupIds.vouchers.push(revV.data.value.id);

  // === Task data ===
  const assets = [
    { name: "IT-utstyr", cost: 204150, lifeYears: 4, acct: 1210 },
    { name: "Inventar", cost: 237550, lifeYears: 8, acct: 1240 },
    { name: "Programvare", cost: 307500, lifeYears: 4, acct: 1250 },
  ];
  const PREPAID = 44300;

  // === Register assets ===
  const assetPayload = assets.map(a => ({
    name: a.name,
    dateOfAcquisition: "2025-01-01",
    acquisitionCost: a.cost,
    account: { id: accts[a.acct].id },
    lifetime: a.lifeYears * 12,
    depreciationAccount: { id: accts[1209].id },
    depreciationMethod: "STRAIGHT_LINE",
    depreciationFrom: "2025-01-01",
  }));
  const assetRes = await api("POST", "/asset/list", assetPayload);
  console.log(`Asset registration: ${assetRes.status}`);
  if (assetRes.ok) {
    for (const a of assetRes.data.values) {
      cleanupIds.assets.push(a.id);
      console.log(`  ${a.name}: id=${a.id} status=${a.status}`);
    }
  } else {
    console.log(`  Error: ${JSON.stringify(assetRes.data).slice(0, 300)}`);
  }

  // === Post depreciation vouchers ===
  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    const dep = r2(a.cost / a.lifeYears);
    const assetId = cleanupIds.assets[i];
    
    const v = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: `Avskrivning ${a.name} 2025`,
      postings: [
        { row: 1, account: { id: accts[6010].id }, amountGross: dep, amountGrossCurrency: dep, 
          description: `Avskrivning ${a.name}`, asset: assetId ? { id: assetId } : undefined },
        { row: 2, account: { id: accts[1209].id }, amountGross: -dep, amountGrossCurrency: -dep, 
          description: `Akk. avskrivning ${a.name}`, asset: assetId ? { id: assetId } : undefined },
      ],
    });
    if (v.ok) cleanupIds.vouchers.push(v.data.value.id);
    console.log(`Dep ${a.name} (${dep}): ${v.status}`);
  }

  // === Prepaid reversal ===
  const name1700 = accts[1700]?.name?.toLowerCase() || "";
  const contraAcct = name1700.includes("forsikring") ? 7500 : 6300;
  
  const prepV = await api("POST", "/ledger/voucher", {
    date: "2025-12-31", description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      { row: 1, account: { id: accts[contraAcct].id }, amountGross: PREPAID, amountGrossCurrency: PREPAID, description: "Periodisering leiekostnad" },
      { row: 2, account: { id: accts[1700].id }, amountGross: -PREPAID, amountGrossCurrency: -PREPAID, description: "Forskuddsbetalte kostnader" },
    ],
  });
  if (prepV.ok) cleanupIds.vouchers.push(prepV.data.value.id);

  // ======== TAX CALCULATION COMPARISON ========
  console.log("\n\n========== TAX CALCULATION COMPARISON ==========");

  // Method A: Balance sheet 3000-8299
  const bsA = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8299&fields=*,account(number,name)&count=1000");
  let sumA = 0;
  for (const row of (bsA.data.values || [])) sumA += row.balanceOut || 0;
  const profitA = r2(-sumA);
  const taxA = Math.round(Math.max(0, profitA) * 0.22);
  console.log(`A) Balance sheet 3000-8299: preTaxProfit=${profitA}, tax=${taxA}`);

  // Method B: yearEnd operatingRevenue/operatingExpense  
  const yeB = await api("GET", "/yearEnd?fields=operatingRevenue,operatingExpense,capitalIncome,capitalCost,extraordinaryCost");
  if (yeB.ok) {
    const d = yeB.data.value;
    const opRev = d.operatingRevenue?.sumAmount || 0;
    const opExp = d.operatingExpense?.sumAmount || 0;
    const capInc = d.capitalIncome?.sumAmount || 0;
    const capCost = d.capitalCost?.sumAmount || 0;
    const extraCost = d.extraordinaryCost?.sumAmount || 0;
    const profitB = opRev - opExp + capInc - capCost - extraCost;
    const taxB = Math.round(Math.max(0, profitB) * 0.22);
    console.log(`B) yearEnd fields: opRev=${opRev}, opExp=${opExp}, capInc=${capInc}, capCost=${capCost}, profitB=${profitB}, tax=${taxB}`);
  }

  // Method C: yearEnd/annualAccounts ordinaryResultBeforeTaxes
  const yeC = await api("GET", "/yearEnd/annualAccounts?year=2025&fields=ordinaryResultBeforeTaxes,ordinaryResultAfterTaxes,netProfitOrLossForTheYear,operatingProfit");
  if (yeC.ok) {
    const d = yeC.data.value;
    console.log(`C) annualAccounts:`);
    console.log(`   ordinaryResultBeforeTaxes: ${JSON.stringify(d.ordinaryResultBeforeTaxes)}`);
    console.log(`   operatingProfit: ${JSON.stringify(d.operatingProfit)}`);
    console.log(`   ordinaryResultAfterTaxes: ${JSON.stringify(d.ordinaryResultAfterTaxes)}`);
    const preTaxC = d.ordinaryResultBeforeTaxes?.sumClosingBalance;
    if (preTaxC != null) {
      // Note: yearEnd shows expenses as POSITIVE, result as NEGATIVE when profitable
      const taxC = Math.round(Math.max(0, -preTaxC) * 0.22);
      console.log(`   preTaxC=${preTaxC}, tax=${taxC} (using -sumClosingBalance)`);
    }
  }

  // Method D: yearEnd annualResult (net result, not pre-tax)
  const yeD = await api("GET", "/yearEnd?fields=annualResult,annualResultPreviousYear");
  console.log(`D) yearEnd.annualResult: ${yeD.data?.value?.annualResult}`);

  // Also check: what accounts are included in balance sheet 3000-8299 vs what yearEnd shows
  console.log("\n=== Balance sheet detail (3000-8299) ===");
  for (const row of (bsA.data.values || [])) {
    if (Math.abs(row.balanceOut) > 0.01) {
      console.log(`  ${row.account?.number} "${row.account?.name}": ${row.balanceOut}`);
    }
  }

  // ======== CLEANUP ========
  console.log("\n\n========== CLEANUP ==========");
  for (const id of cleanupIds.vouchers.reverse()) {
    await api("DELETE", `/ledger/voucher/${id}`);
  }
  for (const id of cleanupIds.assets.reverse()) {
    await api("DELETE", `/asset/${id}`);
  }
  console.log(`Cleaned up ${cleanupIds.vouchers.length} vouchers, ${cleanupIds.assets.length} assets`);
}

main().catch(e => { console.error(e); process.exit(1); });
