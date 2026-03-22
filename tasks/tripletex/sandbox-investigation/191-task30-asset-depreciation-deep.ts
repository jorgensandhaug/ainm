/**
 * Task 30 — Deep investigation of asset register + depreciation.
 * Hypothesis: registering assets with correct depreciation parameters
 * populates yearEnd tangibleFixedAssets and possibly auto-creates depreciation postings.
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
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) console.log(`${method} ${path} → ${res.status}: ${typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data).slice(0, 300)}`);
  else console.log(`${method} ${path} → ${res.status}`);
  return { status: res.status, data, ok: res.ok };
}

async function main() {
  // Get account IDs
  const acctRes = await api("GET", "/ledger/account?number=1209,1210,1240,1250,6010&fields=id,number,name");
  const accts: Record<number, { id: number; name: string }> = {};
  for (const a of acctRes.data.values) {
    accts[a.number] = { id: a.id, name: a.name };
  }

  // Create one asset with ALL fields properly set
  console.log("\n=== 1. Create asset with full depreciation settings ===");
  const asset1 = await api("POST", "/asset", {
    name: "Test IT-utstyr",
    description: "Test asset for depreciation",
    dateOfAcquisition: "2025-01-01",
    acquisitionCost: 204150,
    lifetime: 48, // 4 years in months
    account: { id: accts[1210].id },
    depreciationAccount: { id: accts[6010].id },
    depreciationMethod: "STRAIGHT_LINE",
    depreciationFrom: "2025-01-01",
  });
  
  if (!asset1.ok) {
    console.error("Failed to create asset");
    return;
  }

  const assetId = asset1.data.value.id;
  const assetData = asset1.data.value;
  console.log(`  Created asset ${assetId}`);
  console.log(`  status: ${assetData.status}`);
  console.log(`  depreciationMethod: ${assetData.depreciationMethod}`);
  console.log(`  depreciationFrom: ${assetData.depreciationFrom}`);
  console.log(`  annualDepreciation: ${assetData.annualDepreciation}`);
  console.log(`  accumulatedDepreciation: ${assetData.accumulatedDepreciation}`);
  console.log(`  depreciationBasis: ${assetData.depreciationBasis}`);
  console.log(`  depreciationAmount: ${assetData.depreciationAmount}`);
  console.log(`  totalDepreciationAmount: ${assetData.totalDepreciationAmount}`);
  console.log(`  balanceIn: ${assetData.balanceIn}`);
  console.log(`  balanceOut: ${assetData.balanceOut}`);
  console.log(`  balanceChange: ${assetData.balanceChange}`);
  console.log(`  numberOfMonths: ${assetData.numberOfMonths}`);
  console.log(`  depreciationRemainingValue: ${assetData.depreciationRemainingValue}`);

  // Full GET with all fields
  console.log("\n=== 2. Full GET of asset ===");
  const assetFull = await api("GET", `/asset/${assetId}?fields=*`);
  if (assetFull.ok) {
    const a = assetFull.data.value;
    for (const key of Object.keys(a).sort()) {
      const val = a[key];
      if (val !== null && val !== undefined && val !== '' && val !== 0 && val !== false) {
        console.log(`  ${key}: ${typeof val === 'object' ? JSON.stringify(val).slice(0, 100) : val}`);
      }
    }
  }

  // Check postings
  console.log("\n=== 3. Asset postings ===");
  const postings = await api("GET", `/asset/${assetId}/postings?fields=*`);
  console.log(`  Posting count: ${postings.data?.fullResultSize || 0}`);
  for (const p of (postings.data?.values || [])) {
    console.log(`  ${p.date}: acct=${p.account?.number} amount=${p.amount}`);
  }

  // Check yearEnd for tangibleFixedAssets
  console.log("\n=== 4. yearEnd tangibleFixedAssets ===");
  const ye = await api("GET", "/yearEnd?year=2025&fields=tangibleFixedAssets,fixedAsset,showInfoSumDepreciation");
  if (ye.ok) {
    console.log(`  tangibleFixedAssets: ${JSON.stringify(ye.data.value.tangibleFixedAssets)?.slice(0, 300)}`);
    console.log(`  fixedAsset: ${JSON.stringify(ye.data.value.fixedAsset)?.slice(0, 300)}`);
    console.log(`  showInfoSumDepreciation: ${ye.data.value.showInfoSumDepreciation}`);
  }

  // Check balanceAccountsSum
  console.log("\n=== 5. Asset balance accounts sum ===");
  const bsSum = await api("GET", "/asset/balanceAccountsSum?year=2025");
  if (bsSum.ok) {
    console.log(`  Response: ${JSON.stringify(bsSum.data).slice(0, 500)}`);
  }

  // Check if the asset register shows depreciation
  console.log("\n=== 6. Asset register overview ===");
  const assetsOverview = await api("GET", "/asset?count=50&fields=id,name,acquisitionCost,status,annualDepreciation,accumulatedDepreciation,depreciationAmount,numberOfMonths,balanceOut");
  if (assetsOverview.ok) {
    for (const a of assetsOverview.data.values) {
      console.log(`  id=${a.id} "${a.name}" cost=${a.acquisitionCost} status=${a.status} annualDep=${a.annualDepreciation} accumDep=${a.accumulatedDepreciation} depAmt=${a.depreciationAmount} months=${a.numberOfMonths} balOut=${a.balanceOut}`);
    }
  }

  // Check if assetsExist changes
  console.log("\n=== 7. Assets exist check ===");
  const assetsExist = await api("GET", "/asset/assetsExist");
  console.log(`  Response: ${JSON.stringify(assetsExist.data).slice(0, 200)}`);

  // Try setting depreciationRemainingValue or other fields
  console.log("\n=== 8. Try updating asset with depreciationRemainingValue ===");
  const updated = await api("PUT", `/asset/${assetId}`, {
    ...assetData,
    id: assetId,
    version: assetData.version,
    depreciationRemainingValue: 204150 - (204150 / 4), // After 1 year
  });
  if (updated.ok) {
    console.log(`  Updated OK: depRemaining=${updated.data.value.depreciationRemainingValue} accumDep=${updated.data.value.accumulatedDepreciation}`);
  }

  // Clean up
  console.log("\n=== CLEANUP ===");
  await api("DELETE", `/asset/${assetId}`);
}

main().catch(e => { console.error(e); process.exit(1); });
