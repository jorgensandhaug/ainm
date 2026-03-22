/**
 * Task 30 — Full E2E with Asset Register Integration
 *
 * Tests the PRIMARY HYPOTHESIS from migration queue:
 * Registering assets via POST /asset populates yearEnd.tangibleFixedAssets
 * and may fix checks 4+5 (stuck at 6/10 across all 14 runs).
 *
 * Flow:
 * Phase 0: Activate YEAR_END_REPORTING_AS + FIXED_ASSETS_REGISTER modules
 * Phase 1: Account lookup + create missing
 * Phase 1c: Register assets via POST /asset/list
 * Phase 2: Depreciation vouchers WITH asset linkage + prepaid reversal
 * Phase 3: Balance sheet for tax
 * Phase 4: Tax voucher
 * Phase 5: Result disposition
 * Phase 6: Final state verification (yearEnd, balanceSheet, vouchers)
 */

const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const YEAR = 2025; // fiscal year

// Simulated prompt data (typical task 30 shape)
const ASSETS = [
  { name: "Kontormøbler", cost: 222900, usefulLife: 10, assetAccount: 1210 },
  { name: "IT-utstyr", cost: 254250, usefulLife: 8, assetAccount: 1250 },
  { name: "Programvare", cost: 207900, usefulLife: 6, assetAccount: 1240 },
];
const DEP_COST_ACCOUNT = 6010;
const ACCUM_DEP_ACCOUNT = 1209;
const PREPAID_ACCOUNT = 1700;
const PREPAID_AMOUNT = 45000;
const TAX_EXPENSE_ACCOUNT = 8700;
const TAX_PAYABLE_ACCOUNT = 2920;

const r2 = (v: number) => Math.round(v * 100) / 100;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE_URL}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (res.status >= 400) {
    console.log("ERROR:", JSON.stringify(json, null, 2));
  }
  return { status: res.status, data: json };
}

function extract(res: any) {
  if (res.data?.values !== undefined) return res.data.values;
  if (res.data?.value !== undefined) return res.data.value;
  return res.data;
}

async function main() {
  // ========== PHASE 0: Module Activation ==========
  console.log("\n=== PHASE 0: Module Activation ===");

  // 0a. YEAR_END_REPORTING_AS
  const mod1 = await api("POST", "/company/salesmodules", { name: "YEAR_END_REPORTING_AS" });
  console.log("YEAR_END_REPORTING_AS:", mod1.status === 201 ? "ACTIVATED" : mod1.status === 409 ? "ALREADY ACTIVE" : `UNEXPECTED ${mod1.status}`);

  // 0b. FIXED_ASSETS_REGISTER (NEW from migration queue)
  const mod2 = await api("POST", "/company/salesmodules", { name: "FIXED_ASSETS_REGISTER" });
  console.log("FIXED_ASSETS_REGISTER:", mod2.status === 201 ? "ACTIVATED" : mod2.status === 409 ? "ALREADY ACTIVE" : `UNEXPECTED ${mod2.status}`);

  // 0c. Baseline yearEnd state
  const yearEndBefore = await api("GET", `/yearEnd?year=${YEAR}&fields=*`);
  console.log("\nBASELINE yearEnd:", JSON.stringify(extract(yearEndBefore), null, 2));

  // 0d. Verify modules
  const modules = await api("GET", "/company/modules?fields=*");
  const modData = extract(modules);
  console.log("\nModule flags:", JSON.stringify({
    moduleYearEndReportingAS: modData?.moduleYearEndReportingAS,
    moduleFixedAssetRegister: modData?.moduleFixedAssetRegister,
  }));

  // ========== PHASE 1: Account Lookup ==========
  console.log("\n=== PHASE 1: Account Lookup ===");

  // Need: all asset accounts + dep cost + accum dep + prepaid + contra + tax + disposition
  const assetAccountNums = [...new Set(ASSETS.map(a => a.assetAccount))];
  const allAccountNums = [
    ...assetAccountNums,
    DEP_COST_ACCOUNT, ACCUM_DEP_ACCOUNT,
    PREPAID_ACCOUNT, 6300, 7500,
    TAX_EXPENSE_ACCOUNT, TAX_PAYABLE_ACCOUNT,
    8800, 2050,
  ];

  const acctRes = await api("GET", `/ledger/account?number=${allAccountNums.join(",")}&fields=id,number,name&count=100`);
  const accounts = extract(acctRes) as any[];
  const acctMap: Record<number, number> = {};
  const acctNameMap: Record<number, string> = {};

  for (const a of accounts) {
    acctMap[a.number] = a.id;
    acctNameMap[a.number] = a.name;
    console.log(`  Account ${a.number} "${a.name}" → id=${a.id}`);
  }

  // Check what's missing
  const missing = allAccountNums.filter(n => !acctMap[n]);
  console.log(`\nMissing accounts: ${missing.length > 0 ? missing.join(", ") : "none"}`);

  // ========== PHASE 1b: Create Missing Accounts ==========
  if (missing.length > 0) {
    console.log("\n=== PHASE 1b: Create Missing Accounts ===");
    const nameMap: Record<number, string> = {
      1209: "Akkumulerte avskrivninger",
      1210: "Inventar og utstyr",
      1240: "Biler",
      1250: "IT-utstyr",
      8700: "Skattekostnad på ordinært resultat",
    };

    const toCreate = missing.map(n => ({ number: n, name: nameMap[n] || `Konto ${n}` }));

    if (toCreate.length === 1) {
      const createRes = await api("POST", "/ledger/account", toCreate[0]);
      const created = extract(createRes);
      if (created?.id) {
        acctMap[created.number] = created.id;
        console.log(`  Created ${created.number} → id=${created.id}`);
      }
    } else {
      const createRes = await api("POST", "/ledger/account/list", toCreate);
      const created = extract(createRes);
      if (Array.isArray(created)) {
        for (const c of created) {
          acctMap[c.number] = c.id;
          console.log(`  Created ${c.number} → id=${c.id}`);
        }
      }
    }
  }

  // Determine prepaid contra
  const prepaidName = acctNameMap[PREPAID_ACCOUNT] || "";
  const prepaidContra = prepaidName.toLowerCase().includes("forsikring") ? 7500 : 6300;
  console.log(`\nPrepaid account 1700 name: "${prepaidName}" → contra: ${prepaidContra}`);

  // ========== PHASE 1c: Register Assets (NEW) ==========
  console.log("\n=== PHASE 1c: Register Assets ===");

  const assetPayloads = ASSETS.map(a => ({
    name: a.name,
    dateOfAcquisition: `${YEAR}-01-01`,
    acquisitionCost: a.cost,
    lifetime: a.usefulLife * 12, // MONTHS
    account: { id: acctMap[a.assetAccount] },
    depreciationAccount: { id: acctMap[DEP_COST_ACCOUNT] },
    depreciationMethod: "STRAIGHT_LINE",
    depreciationFrom: `${YEAR}-01-01`,
  }));

  console.log("Asset payloads:", JSON.stringify(assetPayloads, null, 2));

  // Try POST /asset/list first
  let assetIds: number[] = [];
  const assetListRes = await api("POST", "/asset/list", assetPayloads);

  if (assetListRes.status === 201 || assetListRes.status === 200) {
    const created = extract(assetListRes);
    if (Array.isArray(created)) {
      assetIds = created.map((a: any) => a.id);
      console.log("Created assets:", assetIds);
      for (const a of created) {
        console.log(`  Asset "${a.name}" id=${a.id} cost=${a.acquisitionCost} lifetime=${a.lifetime}mo`);
      }
    }
  } else {
    // Fallback: individual POST /asset
    console.log("Batch failed, trying individual POST /asset...");
    for (const payload of assetPayloads) {
      const res = await api("POST", "/asset", payload);
      if (res.status === 201 || res.status === 200) {
        const created = extract(res);
        assetIds.push(created.id);
        console.log(`  Created asset "${created.name}" id=${created.id}`);
      }
    }
  }

  // Verify yearEnd after asset registration
  const yearEndAfterAssets = await api("GET", `/yearEnd?year=${YEAR}&fields=*`);
  console.log("\nyearEnd AFTER asset registration:", JSON.stringify(extract(yearEndAfterAssets), null, 2));

  // ========== PHASE 2: Depreciation + Prepaid Vouchers ==========
  console.log("\n=== PHASE 2: Depreciation + Prepaid Vouchers ===");

  const depAmounts = ASSETS.map(a => r2(a.cost / a.usefulLife));
  console.log("Depreciation amounts:", depAmounts);

  for (let i = 0; i < ASSETS.length; i++) {
    const asset = ASSETS[i];
    const amount = depAmounts[i];
    const assetId = assetIds[i];

    const postings: any[] = [
      {
        row: 1,
        account: { id: acctMap[DEP_COST_ACCOUNT] },
        ...(assetId ? { asset: { id: assetId } } : {}), // Link to asset if available
        amountGross: amount,
        amountGrossCurrency: amount,
        description: `Avskrivning ${asset.name}`,
      },
      {
        row: 2,
        account: { id: acctMap[ACCUM_DEP_ACCOUNT] },
        ...(assetId ? { asset: { id: assetId } } : {}), // Link to asset
        amountGross: -amount,
        amountGrossCurrency: -amount,
        description: `Akk. avskrivning ${asset.name}`,
      },
    ];

    const voucherRes = await api("POST", "/ledger/voucher", {
      date: `${YEAR}-12-31`,
      description: `Avskrivning ${asset.name} ${YEAR}`,
      postings,
    });

    if (voucherRes.status === 201) {
      const v = extract(voucherRes);
      console.log(`  Depreciation voucher ${i + 1}: id=${v.id}, number=${v.number}`);
      // Verify
      const verify = await api("GET", `/ledger/voucher/${v.id}?fields=id,number,date,description,postings(*)`);
      console.log("  Verified:", JSON.stringify(extract(verify), null, 2));
    }
  }

  // Prepaid reversal
  const prepaidRes = await api("POST", "/ledger/voucher", {
    date: `${YEAR}-12-31`,
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      { row: 1, account: { id: acctMap[prepaidContra] }, amountGross: PREPAID_AMOUNT, amountGrossCurrency: PREPAID_AMOUNT, description: "Periodisering leiekostnad" },
      { row: 2, account: { id: acctMap[PREPAID_ACCOUNT] }, amountGross: -PREPAID_AMOUNT, amountGrossCurrency: -PREPAID_AMOUNT, description: "Forskuddsbetalte kostnader" },
    ],
  });

  if (prepaidRes.status === 201) {
    const v = extract(prepaidRes);
    console.log(`\nPrepaid reversal voucher: id=${v.id}, number=${v.number}`);
  }

  // Check yearEnd after depreciation + prepaid
  const yearEndAfterDep = await api("GET", `/yearEnd?year=${YEAR}&fields=*`);
  console.log("\nyearEnd AFTER depreciation+prepaid:", JSON.stringify(extract(yearEndAfterDep), null, 2));

  // ========== PHASE 3: Balance Sheet for Tax ==========
  console.log("\n=== PHASE 3: Balance Sheet for Tax ===");

  const bsRes = await api("GET", `/balanceSheet?dateFrom=${YEAR}-01-01&dateTo=${YEAR + 1}-01-01&accountNumberFrom=3000&accountNumberTo=8299&fields=*,account(id,number,name)&count=1000`);
  const bsRows = extract(bsRes) as any[];

  let sumBalanceOut = 0;
  if (Array.isArray(bsRows)) {
    for (const row of bsRows) {
      if (row.balanceOut !== 0) {
        console.log(`  ${row.account?.number} ${row.account?.name}: balanceOut=${row.balanceOut}`);
        sumBalanceOut += row.balanceOut;
      }
    }
  }

  const preTaxProfit = -sumBalanceOut;
  const taxAmount = Math.round(Math.max(0, preTaxProfit) * 0.22);
  console.log(`\nsumBalanceOut=${sumBalanceOut}, preTaxProfit=${preTaxProfit}, taxAmount=${taxAmount}`);

  // ========== PHASE 4: Tax Voucher ==========
  if (taxAmount > 0) {
    console.log("\n=== PHASE 4: Tax Voucher ===");
    const taxRes = await api("POST", "/ledger/voucher", {
      date: `${YEAR}-12-31`,
      description: `Skattekostnad ${YEAR}`,
      postings: [
        { row: 1, account: { id: acctMap[TAX_EXPENSE_ACCOUNT] }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
        { row: 2, account: { id: acctMap[TAX_PAYABLE_ACCOUNT] }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
      ],
    });
    if (taxRes.status === 201) {
      const v = extract(taxRes);
      console.log(`Tax voucher: id=${v.id}, number=${v.number}`);
    }
  } else {
    console.log("\n=== PHASE 4: Tax Voucher — SKIPPED (taxAmount=0) ===");
  }

  // ========== PHASE 5: Result Disposition ==========
  console.log("\n=== PHASE 5: Result Disposition ===");
  const postTaxResult = preTaxProfit - taxAmount;
  console.log(`postTaxResult = ${preTaxProfit} - ${taxAmount} = ${postTaxResult}`);

  if (postTaxResult !== 0) {
    const isProfit = postTaxResult > 0;
    const absResult = Math.abs(postTaxResult);

    const dispRes = await api("POST", "/ledger/voucher", {
      date: `${YEAR}-12-31`,
      description: `Disponering av årsresultat ${YEAR}`,
      postings: isProfit ? [
        { row: 1, account: { id: acctMap[8800] }, amountGross: absResult, amountGrossCurrency: absResult, description: "Årsresultat" },
        { row: 2, account: { id: acctMap[2050] }, amountGross: -absResult, amountGrossCurrency: -absResult, description: "Annen egenkapital" },
      ] : [
        { row: 1, account: { id: acctMap[2050] }, amountGross: absResult, amountGrossCurrency: absResult, description: "Annen egenkapital" },
        { row: 2, account: { id: acctMap[8800] }, amountGross: -absResult, amountGrossCurrency: -absResult, description: "Årsresultat" },
      ],
    });
    if (dispRes.status === 201) {
      const v = extract(dispRes);
      console.log(`Disposition voucher: id=${v.id}, number=${v.number}`);
    }
  }

  // ========== PHASE 6: Final State Verification ==========
  console.log("\n=== PHASE 6: Final State Verification ===");

  // 6a. Final yearEnd
  const yearEndFinal = await api("GET", `/yearEnd?year=${YEAR}&fields=*`);
  console.log("\nFINAL yearEnd:", JSON.stringify(extract(yearEndFinal), null, 2));

  // 6b. Check tangibleFixedAssets specifically
  const yeData = extract(yearEndFinal);
  if (yeData) {
    console.log("\n=== KEY yearEnd FIELDS ===");
    console.log("tangibleFixedAssets:", JSON.stringify(yeData.tangibleFixedAssets, null, 2));
    console.log("annualResult:", JSON.stringify(yeData.annualResult, null, 2));
    console.log("taxCost:", JSON.stringify(yeData.taxCost, null, 2));
    console.log("operatingExpense:", JSON.stringify(yeData.operatingExpense, null, 2));
    console.log("yearEndReportPosting:", JSON.stringify(yeData.yearEndReportPosting, null, 2));
    console.log("status:", yeData.status);
  }

  // 6c. Check assets in asset register
  const assetsCheck = await api("GET", `/asset?fields=*&count=100`);
  console.log("\nAsset register:", JSON.stringify(extract(assetsCheck), null, 2));

  // 6d. Full balance sheet
  const bsFinal = await api("GET", `/balanceSheet?dateFrom=${YEAR}-01-01&dateTo=${YEAR + 1}-01-01&accountNumberFrom=1000&accountNumberTo=9999&fields=account(number,name),balanceIn,balanceOut&count=2000`);
  const bsFinalRows = extract(bsFinal) as any[];
  console.log("\nFinal Balance Sheet (non-zero balanceOut):");
  if (Array.isArray(bsFinalRows)) {
    for (const row of bsFinalRows) {
      if (row.balanceOut !== 0) {
        console.log(`  ${row.account?.number} ${row.account?.name}: balanceIn=${row.balanceIn}, balanceOut=${row.balanceOut}`);
      }
    }
  }

  // 6e. All year-end vouchers
  const vouchersRes = await api("GET", `/ledger/voucher?dateFrom=${YEAR}-12-31&dateTo=${YEAR + 1}-01-01&fields=id,number,date,description,postings(row,account(number,name),amountGross,asset(*))&count=50`);
  console.log("\nYear-end vouchers:", JSON.stringify(extract(vouchersRes), null, 2));

  console.log("\n=== DONE ===");
}

main().catch(e => console.error("FATAL:", e));
