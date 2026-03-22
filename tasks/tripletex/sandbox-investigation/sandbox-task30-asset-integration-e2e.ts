/**
 * Task 30 — FULL E2E with ASSET REGISTRATION
 *
 * This tests the PRIMARY untested hypothesis from the migration queue:
 * Registering assets via POST /asset + linking depreciation vouchers
 * to assets may fix checks 4+5 (stuck at 6/10 for 14 production runs).
 *
 * Uses exact values from latest prod prompt (884991bc):
 * - IT-utstyr: 382900, 5y, konto 1210
 * - Programvare: 436000, 10y, konto 1250
 * - Inventar: 384600, 5y, konto 1240
 * - Dep cost: 6010, accum dep: 1209
 * - Prepaid: 52850 on 1700
 * - Tax: 8700/2920 (prompt says) but also test 8300/2500
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + Buffer.from(`0:${TOKEN}`).toString("base64");
const r2 = (v: number) => Math.round(v * 100) / 100;

async function api(method: string, path: string, body?: any, query?: Record<string, string>) {
  let url = `${BASE}${path}`;
  if (query) url += "?" + new URLSearchParams(query).toString();
  const res = await fetch(url, {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok && res.status !== 409) {
    console.log(`  ${method} ${path} → ${res.status}: ${typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)}`);
  }
  return { status: res.status, data, ok: res.ok };
}

async function main() {
  console.log("===== TASK 30 — ASSET REGISTRATION E2E TEST =====\n");

  // ── Phase 0: Module activation ──
  console.log("--- Phase 0: Module activation ---");
  const m1 = await api("POST", "/company/salesmodules", { name: "YEAR_END_REPORTING_AS" });
  console.log(`  YEAR_END_REPORTING_AS: ${m1.status} (${m1.ok ? 'activated' : m1.status === 409 ? 'already active' : 'FAIL'})`);

  const m2 = await api("POST", "/company/salesmodules", { name: "FIXED_ASSETS_REGISTER" });
  console.log(`  FIXED_ASSETS_REGISTER: ${m2.status} (${m2.ok ? 'activated' : m2.status === 409 ? 'already active' : 'FAIL'})`);

  // ── Baseline yearEnd ──
  console.log("\n--- Baseline yearEnd ---");
  const yeBaseline = await api("GET", "/yearEnd", undefined, { year: "2025", fields: "*" });
  if (yeBaseline.ok) {
    const v = yeBaseline.data.value;
    console.log(`  status: ${v.status}`);
    console.log(`  annualResult: ${v.annualResult}`);
    console.log(`  tangibleFixedAssets: ${JSON.stringify(v.tangibleFixedAssets)}`);
    console.log(`  yearEndReportPosting: ${JSON.stringify(v.yearEndReportPosting)}`);
    console.log(`  taxCost: ${JSON.stringify(v.taxCost)}`);
    console.log(`  operatingExpense: ${JSON.stringify(v.operatingExpense)}`);
    console.log(`  fixedAsset: ${JSON.stringify(v.fixedAsset)}`);
  }

  // ── Phase 1: Account lookup ──
  console.log("\n--- Phase 1: Account lookup ---");
  const acctNums = "1209,1210,1240,1250,6010,1700,6300,7500,8300,2500,8700,2920,8800,2050";
  const acctRes = await api("GET", "/ledger/account", undefined, {
    number: acctNums, fields: "id,number,name", count: "20"
  });
  const accts: Record<number, { id: number; name: string }> = {};
  for (const a of acctRes.data?.values ?? []) {
    accts[a.number] = { id: a.id, name: a.name };
    console.log(`  ${a.number}: "${a.name}" (id=${a.id})`);
  }

  // Create missing accounts
  const needed = [1209, 6010, 1700, 6300, 8300, 2500, 8700, 2920, 8800, 2050];
  const missing = needed.filter(n => !accts[n]);
  if (missing.length > 0) {
    console.log(`  Creating missing: ${missing.join(", ")}`);
    const names: Record<number, string> = {
      1209: "Akkumulerte avskrivninger", 8700: "Skattekostnad på ordinært resultat",
      2920: "Betalbar skatt", 8800: "Årsresultat", 2050: "Annen egenkapital",
    };
    const batch = missing.map(n => ({ number: n, name: names[n] || `Konto ${n}` }));
    if (missing.length === 1) {
      const cr = await api("POST", "/ledger/account", batch[0]);
      if (cr.ok) accts[missing[0]] = { id: cr.data.value.id, name: cr.data.value.name };
    } else {
      const cr = await api("POST", "/ledger/account/list", batch);
      for (const a of cr.data?.values ?? []) accts[a.number] = { id: a.id, name: a.name };
    }
  }

  // Resolve prepaid contra
  const name1700 = accts[1700]?.name?.toLowerCase() || "";
  const contraAcct = name1700.includes("forsikring") ? 7500 : 6300;
  console.log(`  Prepaid contra: ${contraAcct} (1700="${accts[1700]?.name}")`);

  // ── Phase 2: Register assets ──
  console.log("\n--- Phase 2: Register assets ---");
  const assets = [
    { name: "IT-utstyr", cost: 382900, lifeYears: 5, acctNum: 1210 },
    { name: "Programvare", cost: 436000, lifeYears: 10, acctNum: 1250 },
    { name: "Inventar", cost: 384600, lifeYears: 5, acctNum: 1240 },
  ];

  const assetIds: number[] = [];
  for (const a of assets) {
    const assetAcct = accts[a.acctNum];
    if (!assetAcct) {
      console.log(`  SKIP "${a.name}": account ${a.acctNum} not found`);
      assetIds.push(0);
      continue;
    }
    const assetRes = await api("POST", "/asset", {
      name: a.name,
      dateOfAcquisition: "2025-01-01",
      acquisitionCost: a.cost,
      account: { id: assetAcct.id },
      lifetime: a.lifeYears * 12, // MONTHS
      depreciationAccount: { id: accts[1209].id },
      depreciationMethod: "STRAIGHT_LINE",
      depreciationFrom: "2025-01-01",
    });
    const aid = assetRes.data?.value?.id;
    assetIds.push(aid || 0);
    console.log(`  Asset "${a.name}": ${assetRes.status} id=${aid} status=${assetRes.data?.value?.status}`);
  }

  // ── Check yearEnd after asset registration (before vouchers) ──
  console.log("\n--- yearEnd AFTER asset registration (before vouchers) ---");
  const yeAfterAssets = await api("GET", "/yearEnd", undefined, { year: "2025", fields: "tangibleFixedAssets(*),fixedAsset,annualResult" });
  if (yeAfterAssets.ok) {
    const v = yeAfterAssets.data.value;
    console.log(`  tangibleFixedAssets: ${JSON.stringify(v.tangibleFixedAssets)?.slice(0, 500)}`);
    console.log(`  fixedAsset: ${JSON.stringify(v.fixedAsset)}`);
    console.log(`  annualResult: ${v.annualResult}`);
  }

  // ── Phase 3: Depreciation vouchers WITH asset linkage ──
  console.log("\n--- Phase 3: Depreciation vouchers (with asset linkage) ---");
  const depAmounts: number[] = [];
  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    const dep = r2(a.cost / a.lifeYears);
    depAmounts.push(dep);

    const postings: any[] = [
      {
        row: 1,
        account: { id: accts[6010].id },
        amountGross: dep,
        amountGrossCurrency: dep,
        description: `Avskrivning ${a.name}`,
        ...(assetIds[i] ? { asset: { id: assetIds[i] } } : {}),
      },
      {
        row: 2,
        account: { id: accts[1209].id },
        amountGross: -dep,
        amountGrossCurrency: -dep,
        description: `Akk. avskrivning ${a.name}`,
        ...(assetIds[i] ? { asset: { id: assetIds[i] } } : {}),
      },
    ];

    const v = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: `Avskrivning ${a.name} 2025`,
      postings,
    });
    console.log(`  "${a.name}" dep=${dep}: ${v.status}`);
    if (v.ok) {
      // Verify asset linkage in response
      const p0 = v.data.value.postings?.[0];
      console.log(`    posting[0].asset: ${JSON.stringify(p0?.asset)}`);
    }
  }

  // ── Phase 4: Prepaid reversal ──
  console.log("\n--- Phase 4: Prepaid reversal ---");
  const prepV = await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      { row: 1, account: { id: accts[contraAcct].id }, amountGross: 52850, amountGrossCurrency: 52850, description: "Periodisering leiekostnad" },
      { row: 2, account: { id: accts[1700].id }, amountGross: -52850, amountGrossCurrency: -52850, description: "Forskuddsbetalte kostnader" },
    ],
  });
  console.log(`  Prepaid reversal: ${prepV.status}`);

  // ── Phase 5: Balance sheet for tax ──
  console.log("\n--- Phase 5: Tax calculation ---");
  const bs = await api("GET", "/balanceSheet", undefined, {
    dateFrom: "2025-01-01", dateTo: "2026-01-01",
    accountNumberFrom: "3000", accountNumberTo: "8299",
    fields: "*,account(id,number,name)", count: "1000",
  });
  let sumBal = 0;
  for (const row of bs.data?.values ?? []) {
    if (Math.abs(row.balanceOut) > 0.01) {
      console.log(`    ${row.account?.number} ${row.account?.name}: ${row.balanceOut}`);
      sumBal += row.balanceOut;
    }
  }
  const preTaxProfit = r2(-sumBal);
  const taxAmount = Math.round(Math.max(0, preTaxProfit) * 0.22);
  console.log(`  sumBal=${sumBal}, preTaxProfit=${preTaxProfit}, taxAmount=${taxAmount}`);

  // ── Phase 6: Tax voucher (use 8700/2920 as prompt says) ──
  console.log("\n--- Phase 6: Tax voucher ---");
  if (taxAmount > 0) {
    const taxV = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Skattekostnad 2025",
      postings: [
        { row: 1, account: { id: accts[8700].id }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
        { row: 2, account: { id: accts[2920].id }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
      ],
    });
    console.log(`  Tax (DR 8700 / CR 2920): ${taxV.status}`);
  } else {
    console.log("  No tax (preTaxProfit <= 0)");
  }

  // ── Phase 7: Disposition ──
  console.log("\n--- Phase 7: Disposition ---");
  const postTaxResult = r2(preTaxProfit - taxAmount);
  console.log(`  postTaxResult=${postTaxResult}`);
  if (postTaxResult !== 0) {
    const isProfit = postTaxResult > 0;
    const absVal = Math.abs(postTaxResult);
    const dispV = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Disponering av årsresultat 2025",
      postings: isProfit ? [
        { row: 1, account: { id: accts[8800].id }, amountGross: absVal, amountGrossCurrency: absVal, description: "Årsresultat" },
        { row: 2, account: { id: accts[2050].id }, amountGross: -absVal, amountGrossCurrency: -absVal, description: "Annen egenkapital" },
      ] : [
        { row: 1, account: { id: accts[2050].id }, amountGross: absVal, amountGrossCurrency: absVal, description: "Annen egenkapital" },
        { row: 2, account: { id: accts[8800].id }, amountGross: -absVal, amountGrossCurrency: -absVal, description: "Årsresultat" },
      ],
    });
    console.log(`  Disposition: ${dispV.status} (${isProfit ? 'profit' : 'loss'})`);
  }

  // ── Phase 8: FULL YEAREND AUDIT ──
  console.log("\n\n========== FULL YEAREND AUDIT ==========");
  const yeFinal = await api("GET", "/yearEnd", undefined, { year: "2025", fields: "*" });
  if (yeFinal.ok) {
    const v = yeFinal.data.value;
    console.log(`status: ${v.status}`);
    console.log(`annualResult: ${v.annualResult}`);

    // Key fields for scoring
    console.log(`\n-- Critical fields --`);
    console.log(`tangibleFixedAssets: ${JSON.stringify(v.tangibleFixedAssets)?.slice(0, 500)}`);
    console.log(`yearEndReportPosting: ${JSON.stringify(v.yearEndReportPosting)?.slice(0, 500)}`);
    console.log(`yearEndReportBasicData: ${JSON.stringify(v.yearEndReportBasicData)?.slice(0, 500)}`);

    // Operating
    console.log(`\n-- Operating --`);
    console.log(`operatingRevenue: ${JSON.stringify(v.operatingRevenue)}`);
    console.log(`operatingExpense: ${JSON.stringify(v.operatingExpense)}`);

    // Financial
    console.log(`\n-- Financial / Tax --`);
    console.log(`capitalIncome: ${JSON.stringify(v.capitalIncome)}`);
    console.log(`capitalCost: ${JSON.stringify(v.capitalCost)}`);
    console.log(`taxCost: ${JSON.stringify(v.taxCost)}`);

    // Balance sheet
    console.log(`\n-- Balance Sheet --`);
    console.log(`fixedAsset: ${JSON.stringify(v.fixedAsset)}`);
    console.log(`currentAsset: ${JSON.stringify(v.currentAsset)}`);
    console.log(`equity: ${JSON.stringify(v.equity)}`);
    console.log(`debt: ${JSON.stringify(v.debt)}`);

    // Additional
    console.log(`\n-- Additional --`);
    console.log(`wealthFromBusinessActivity: ${JSON.stringify(v.wealthFromBusinessActivity)}`);
    console.log(`extraordinaryCost: ${JSON.stringify(v.extraordinaryCost)}`);

    // All keys
    console.log(`\nALL KEYS: ${Object.keys(v).join(", ")}`);
  }

  // ── Check annualAccounts ──
  console.log("\n========== ANNUAL ACCOUNTS AUDIT ==========");
  const aa = await api("GET", "/yearEnd/annualAccounts", undefined, { year: "2025", fields: "*" });
  if (aa.ok) {
    const v = aa.data.value;
    for (const [key, section] of Object.entries(v)) {
      if (section === null) {
        console.log(`${key}: null`);
      } else if (typeof section === 'object' && (section as any).name) {
        const s = section as any;
        console.log(`\n${key}: "${s.name}" sum_closing=${s.sumClosingBalance} sum_opening=${s.sumOpeningBalance}`);
        if (s.subTotalLines) {
          for (const line of s.subTotalLines) {
            if (Math.abs(line.closingBalance) > 0.01 || line.name) {
              console.log(`  [${line.orid}] "${line.name}" grouping=${line.grouping} closing=${line.closingBalance}`);
            }
          }
        }
      } else if (typeof section === 'object') {
        console.log(`${key}: ${JSON.stringify(section).slice(0, 200)}`);
      } else {
        console.log(`${key}: ${section}`);
      }
    }
  }

  // ── Check asset status ──
  console.log("\n========== ASSET STATUS ==========");
  for (let i = 0; i < assets.length; i++) {
    if (assetIds[i]) {
      const aRes = await api("GET", `/asset/${assetIds[i]}`, undefined, {
        fields: "id,name,status,acquisitionCost,annualDepreciation,accumulatedDepreciation,balanceOut,lifetime"
      });
      if (aRes.ok) {
        const d = aRes.data.value;
        console.log(`  ${d.name}: status=${d.status} cost=${d.acquisitionCost} annDep=${d.annualDepreciation} accDep=${d.accumulatedDepreciation} balOut=${d.balanceOut} lifetime=${d.lifetime}`);
      }
    }
  }

  console.log("\n========== DONE ==========");
  console.log(`Assets created: ${assetIds.filter(id => id > 0).length}`);
  console.log(`Depreciation amounts: ${depAmounts.map((d, i) => `${assets[i].name}=${d}`).join(", ")}`);
  console.log(`Tax: ${taxAmount} (preTaxProfit=${preTaxProfit})`);
  console.log(`Disposition: ${postTaxResult}`);
}

main().catch(console.error);
