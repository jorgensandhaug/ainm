/**
 * Task 30 — FULL E2E with the CORRECT accounting flow:
 * 1. Activate FIXED_ASSETS_REGISTER + YEAR_END_REPORTING_AS modules
 * 2. Register assets in asset register
 * 3. Post depreciation vouchers WITH asset linkage
 * 4. Post prepaid reversal
 * 5. Read balance sheet for tax calc
 * 6. Post tax (8300/2500)
 * 7. Post disposition (8800/2050)
 * 8. Audit ALL yearEnd fields
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
  const createdAssetIds: number[] = [];
  const createdVoucherIds: number[] = [];

  // ===== STEP 0: Activate modules =====
  console.log("=== 0. Activate modules ===");
  for (const mod of ["FIXED_ASSETS_REGISTER", "YEAR_END_REPORTING_AS"]) {
    const r = await api("POST", "/company/salesmodules", { name: mod });
    console.log(`  ${mod}: ${r.status} (${r.ok ? 'OK' : r.status === 409 ? 'already active' : 'FAIL'})`);
  }

  // ===== STEP 1: Revenue (ensure profit for tax test) =====
  console.log("\n=== 1. Create revenue ===");
  const revAcctRes = await api("GET", "/ledger/account?number=1390,3900&fields=id,number");
  const revAccts: Record<number, number> = {};
  for (const a of (revAcctRes.data.values || [])) revAccts[a.number] = a.id;
  
  const revV = await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "Test Revenue",
    postings: [
      { row: 1, account: { id: revAccts[1390] }, amountGross: 500000, amountGrossCurrency: 500000, description: "Fordring" },
      { row: 2, account: { id: revAccts[3900] }, amountGross: -500000, amountGrossCurrency: -500000, description: "Inntekt" },
    ],
  });
  if (revV.ok) createdVoucherIds.push(revV.data.value.id);
  console.log(`  Revenue voucher: ${revV.status}`);

  // ===== STEP 2: Account lookup =====
  console.log("\n=== 2. Account lookup ===");
  const acctRes = await api("GET", "/ledger/account?number=1209,1210,1240,1250,6010,1700,6300,7500,8300,2500,8800,2050&fields=id,number,name");
  const accts: Record<number, { id: number; name: string }> = {};
  for (const a of (acctRes.data.values || [])) accts[a.number] = { id: a.id, name: a.name };
  
  // Create 1209 if missing
  if (!accts[1209]) {
    const c = await api("POST", "/ledger/account", { number: 1209, name: "Akkumulerte avskrivninger" });
    accts[1209] = { id: c.data.value.id, name: c.data.value.name };
    console.log(`  Created 1209: id=${accts[1209].id}`);
  }
  
  // Prepaid contra
  const name1700 = accts[1700]?.name?.toLowerCase() || "";
  const contraAcct = name1700.includes("forsikring") ? 7500 : 6300;
  console.log(`  1700 name: "${accts[1700]?.name}" → contra: ${contraAcct}`);
  console.log(`  Accounts found: ${Object.keys(accts).sort().join(", ")}`);

  // ===== STEP 3: Register assets =====
  console.log("\n=== 3. Register assets ===");
  const assets = [
    { name: "IT-utstyr", cost: 204150, lifeYears: 4, acct: 1210 },
    { name: "Inventar", cost: 237550, lifeYears: 8, acct: 1240 },
    { name: "Programvare", cost: 307500, lifeYears: 4, acct: 1250 },
  ];

  for (const a of assets) {
    const asset = await api("POST", "/asset", {
      name: a.name,
      dateOfAcquisition: "2025-01-01",
      acquisitionCost: a.cost,
      account: { id: accts[a.acct].id },
      lifetime: a.lifeYears * 12, // months!
      depreciationAccount: { id: accts[1209].id },
      depreciationMethod: "STRAIGHT_LINE",
      depreciationFrom: "2025-01-01",
    });
    console.log(`  Asset "${a.name}": ${asset.status} id=${asset.data?.value?.id} status=${asset.data?.value?.status}`);
    if (asset.ok) createdAssetIds.push(asset.data.value.id);
  }

  // ===== STEP 4: Post depreciation vouchers WITH asset linkage =====
  console.log("\n=== 4. Post depreciation with asset linkage ===");
  const depAmounts: number[] = [];
  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    const dep = r2(a.cost / a.lifeYears);
    depAmounts.push(dep);
    
    const v = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: `Avskrivning ${a.name} 2025`,
      postings: [
        { 
          row: 1, 
          account: { id: accts[6010].id }, 
          amountGross: dep, 
          amountGrossCurrency: dep, 
          description: `Avskrivning ${a.name}`,
          asset: createdAssetIds[i] ? { id: createdAssetIds[i] } : undefined,
        },
        { 
          row: 2, 
          account: { id: accts[1209].id }, 
          amountGross: -dep, 
          amountGrossCurrency: -dep, 
          description: `Akk. avskrivning ${a.name}`,
          asset: createdAssetIds[i] ? { id: createdAssetIds[i] } : undefined,
        },
      ],
    });
    console.log(`  Dep "${a.name}" (${dep}): ${v.status}`);
    if (v.ok) {
      createdVoucherIds.push(v.data.value.id);
      // Check if asset field was set on posting
      const postings = v.data.value.postings || [];
      const assetRef = postings[0]?.asset;
      console.log(`    posting.asset: ${JSON.stringify(assetRef)}`);
    } else {
      console.log(`    ERROR: ${JSON.stringify(v.data).slice(0, 300)}`);
    }
  }

  // ===== STEP 5: Prepaid reversal =====
  console.log("\n=== 5. Prepaid reversal ===");
  const prepV = await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      { row: 1, account: { id: accts[contraAcct].id }, amountGross: 44300, amountGrossCurrency: 44300, description: "Periodisering leiekostnad" },
      { row: 2, account: { id: accts[1700].id }, amountGross: -44300, amountGrossCurrency: -44300, description: "Forskuddsbetalte kostnader" },
    ],
  });
  console.log(`  Prepaid: ${prepV.status}`);
  if (prepV.ok) createdVoucherIds.push(prepV.data.value.id);

  // ===== STEP 6: Balance sheet for tax =====
  console.log("\n=== 6. Balance sheet for tax ===");
  const bs = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8299&fields=*,account(id,number,name)&count=1000");
  let sumBal = 0;
  for (const row of (bs.data.values || [])) {
    if (Math.abs(row.balanceOut) > 0.01) sumBal += row.balanceOut;
  }
  const preTaxProfit = r2(-sumBal);
  const taxAmount = Math.round(Math.max(0, preTaxProfit) * 0.22);
  console.log(`  preTaxProfit=${preTaxProfit}, taxAmount=${taxAmount}`);

  // ===== STEP 7: Tax voucher =====
  if (taxAmount > 0) {
    console.log("\n=== 7. Tax voucher ===");
    const taxV = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Skattekostnad 2025",
      postings: [
        { row: 1, account: { id: accts[8300].id }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
        { row: 2, account: { id: accts[2500].id }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
      ],
    });
    console.log(`  Tax: ${taxV.status}`);
    if (taxV.ok) createdVoucherIds.push(taxV.data.value.id);
  }

  // ===== STEP 8: Disposition =====
  console.log("\n=== 8. Disposition ===");
  const postTaxResult = r2(preTaxProfit - taxAmount);
  console.log(`  postTaxResult=${postTaxResult}`);
  if (postTaxResult > 0) {
    const dispV = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Disponering av årsresultat 2025",
      postings: [
        { row: 1, account: { id: accts[8800].id }, amountGross: postTaxResult, amountGrossCurrency: postTaxResult, description: "Årsresultat" },
        { row: 2, account: { id: accts[2050].id }, amountGross: -postTaxResult, amountGrossCurrency: -postTaxResult, description: "Annen egenkapital" },
      ],
    });
    console.log(`  Disposition: ${dispV.status}`);
    if (dispV.ok) createdVoucherIds.push(dispV.data.value.id);
  } else if (postTaxResult < 0) {
    const absVal = Math.abs(postTaxResult);
    const dispV = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Disponering av årsresultat 2025",
      postings: [
        { row: 1, account: { id: accts[2050].id }, amountGross: absVal, amountGrossCurrency: absVal, description: "Annen egenkapital" },
        { row: 2, account: { id: accts[8800].id }, amountGross: -absVal, amountGrossCurrency: -absVal, description: "Årsresultat" },
      ],
    });
    console.log(`  Disposition (loss): ${dispV.status}`);
    if (dispV.ok) createdVoucherIds.push(dispV.data.value.id);
  }

  // ===== STEP 9: FULL YEAREND AUDIT =====
  console.log("\n\n========== YEAREND FULL AUDIT ==========");
  const ye = await api("GET", "/yearEnd?fields=*");
  if (ye.ok) {
    const d = ye.data.value;
    for (const [k, v] of Object.entries(d)) {
      if (v === null) {
        console.log(`${k}: null`);
      } else if (typeof v === 'object') {
        const s = JSON.stringify(v);
        if (s.length < 200) {
          console.log(`${k}: ${s}`);
        } else {
          console.log(`${k}: ${s.slice(0, 200)}...`);
        }
      } else {
        console.log(`${k}: ${JSON.stringify(v)}`);
      }
    }
  }

  // Check tangibleFixedAssets specifically
  console.log("\n=== tangibleFixedAssets detail ===");
  const ye2 = await api("GET", "/yearEnd?fields=tangibleFixedAssets(*)");
  console.log(JSON.stringify(ye2.data?.value?.tangibleFixedAssets, null, 2)?.slice(0, 2000) || "null");

  // Check asset postings
  console.log("\n=== Asset postings ===");
  for (const aid of createdAssetIds) {
    const ap = await api("GET", `/asset/${aid}/postings`);
    console.log(`  Asset ${aid}: ${ap.data?.fullResultSize || 0} postings`);
    if (ap.data?.values?.length > 0) {
      console.log(`    ${JSON.stringify(ap.data.values[0]).slice(0, 300)}`);
    }
  }

  // Check asset full status after posting
  console.log("\n=== Asset status after posting ===");
  for (const aid of createdAssetIds) {
    const a = await api("GET", `/asset/${aid}?fields=id,name,status,annualDepreciation,depreciationAmount,accumulatedDepreciation,balanceOut`);
    if (a.ok) {
      const d = a.data.value;
      console.log(`  ${d.name}: status=${d.status} annDep=${d.annualDepreciation} depAmt=${d.depreciationAmount} accDep=${d.accumulatedDepreciation} balOut=${d.balanceOut}`);
    }
  }

  // ===== CLEANUP =====
  console.log("\n\n========== CLEANUP ==========");
  for (const id of createdVoucherIds.reverse()) {
    const del = await api("DELETE", `/ledger/voucher/${id}`);
    console.log(`  Delete voucher ${id}: ${del.status}`);
  }
  for (const id of createdAssetIds.reverse()) {
    const del = await api("DELETE", `/asset/${id}`);
    console.log(`  Delete asset ${id}: ${del.status}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
