/**
 * Task 30 — Investigate the /asset endpoint for year-end closing.
 * Hypothesis: checks 4+5 require assets registered in the fixed asset register,
 * not just depreciation vouchers posted manually.
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
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) {
    console.error("  ERROR:", typeof data === "string" ? data.slice(0, 500) : JSON.stringify(data, null, 2).slice(0, 800));
  }
  return { status: res.status, data, ok: res.ok };
}

async function main() {
  // 1. Check OpenAPI schema for Asset
  console.log("=== 1. Asset OpenAPI Schema ===");
  const specRes = await fetch(`${BASE}/openapi.json`, { headers: { Authorization: AUTH } });
  const spec = await specRes.json();
  const schemas = spec.components?.schemas || spec.definitions || {};
  
  for (const [name, schema] of Object.entries(schemas)) {
    if (name === "Asset" || name === "AssetGroup") {
      const props = (schema as any).properties || {};
      console.log(`\n  Schema: ${name}`);
      for (const [propName, propDef] of Object.entries(props)) {
        const p = propDef as any;
        console.log(`    ${propName}: ${JSON.stringify(p).slice(0, 200)}`);
      }
    }
  }

  // 2. Check existing assets
  console.log("\n=== 2. Existing Assets ===");
  const existingAssets = await api("GET", "/asset?count=50&fields=*");
  if (existingAssets.ok) {
    console.log(`  Count: ${existingAssets.data.fullResultSize}`);
    for (const a of (existingAssets.data.values || []).slice(0, 5)) {
      console.log(`  id=${a.id} name="${a.name}" cost=${a.acquisitionCost} life=${a.lifetime} acct=${a.account?.number} depAcct=${a.depreciationAccount?.number} method=${a.depreciationMethod}`);
    }
  }

  // 3. Check yearEnd tangibleFixedAssets BEFORE registering assets
  console.log("\n=== 3. yearEnd BEFORE asset registration ===");
  const yeBefore = await api("GET", "/yearEnd?year=2025&fields=tangibleFixedAssets,fixedAsset,annualResult,status");
  if (yeBefore.ok) {
    const d = yeBefore.data.value;
    console.log(`  status: ${d.status}`);
    console.log(`  tangibleFixedAssets: ${JSON.stringify(d.tangibleFixedAssets)?.slice(0, 300)}`);
    console.log(`  fixedAsset: ${JSON.stringify(d.fixedAsset)?.slice(0, 300)}`);
  }

  // 4. Get account IDs we need
  console.log("\n=== 4. Account lookup ===");
  const acctRes = await api("GET", "/ledger/account?number=1209,1210,1240,1250,6010&fields=id,number,name");
  const accts: Record<number, { id: number; name: string }> = {};
  if (acctRes.ok) {
    for (const a of acctRes.data.values) {
      accts[a.number] = { id: a.id, name: a.name };
      console.log(`  ${a.number}: id=${a.id} "${a.name}"`);
    }
  }

  // 5. Try creating an asset
  console.log("\n=== 5. Create test assets ===");
  
  // Simulate task 30 assets
  const testAssets = [
    { name: "IT-utstyr", cost: 204150, lifeYears: 4, assetAcct: 1210 },
    { name: "Inventar", cost: 237550, lifeYears: 8, assetAcct: 1240 },
    { name: "Programvare", cost: 307500, lifeYears: 4, assetAcct: 1250 },
  ];

  const createdAssetIds: number[] = [];

  for (const ta of testAssets) {
    // Try different body shapes
    const body: any = {
      name: ta.name,
      acquisitionCost: ta.cost,
      lifetime: ta.lifeYears * 12, // months
      account: { id: accts[ta.assetAcct]?.id },
      depreciationAccount: { id: accts[6010]?.id },
      depreciationMethod: "STRAIGHT_LINE",
      dateOfAcquisition: "2025-01-01",
    };
    
    console.log(`\n  Creating asset "${ta.name}":`);
    console.log(`    body: ${JSON.stringify(body)}`);
    const created = await api("POST", "/asset", body);
    if (created.ok) {
      const a = created.data.value;
      createdAssetIds.push(a.id);
      console.log(`    ✓ id=${a.id} name="${a.name}" cost=${a.acquisitionCost} life=${a.lifetime}mo method=${a.depreciationMethod}`);
      console.log(`    annualDep=${a.annualDepreciation} accumDep=${a.accumulatedDepreciation}`);
    }
  }

  // 6. Check yearEnd AFTER registering assets
  console.log("\n=== 6. yearEnd AFTER asset registration ===");
  const yeAfter = await api("GET", "/yearEnd?year=2025&fields=tangibleFixedAssets,fixedAsset,annualResult,status");
  if (yeAfter.ok) {
    const d = yeAfter.data.value;
    console.log(`  status: ${d.status}`);
    console.log(`  tangibleFixedAssets: ${JSON.stringify(d.tangibleFixedAssets)?.slice(0, 500)}`);
    console.log(`  fixedAsset: ${JSON.stringify(d.fixedAsset)?.slice(0, 500)}`);
  }

  // 7. Check asset postings
  console.log("\n=== 7. Asset postings ===");
  for (const aid of createdAssetIds) {
    const postings = await api("GET", `/asset/${aid}/postings?fields=*`);
    if (postings.ok) {
      console.log(`  Asset ${aid}: ${postings.data.fullResultSize} postings`);
      for (const p of (postings.data.values || []).slice(0, 5)) {
        console.log(`    ${p.date} acct=${p.account?.number} amount=${p.amount} desc="${p.description}"`);
      }
    }
  }

  // 8. Check if there's a depreciation-related action on assets
  console.log("\n=== 8. Asset depreciation actions ===");
  // Try POST /asset/:depreciate or similar
  const depPaths = [
    "/asset/:depreciate",
    "/asset/:runDepreciation", 
    "/asset/:calculateDepreciation",
  ];
  for (const p of depPaths) {
    const r = await api("POST", p);
    console.log(`  ${p}: ${r.status}`);
  }

  // Also check if there's a year-end specific endpoint for assets
  console.log("\n=== 9. Year-end asset endpoints ===");
  const yePaths = [
    "/yearEnd/:generateReport",
    "/yearEnd/:close",
    "/yearEnd/:finalize",
    "/yearEnd/:createDepreciation",
    "/yearEnd/:createPostings",
    "/yearEnd/:runDepreciation",
  ];
  for (const p of yePaths) {
    const r = await api("PUT", `${p}?year=2025`);
    console.log(`  PUT ${p}: ${r.status}`);
  }
  for (const p of yePaths) {
    const r = await api("POST", `${p}?year=2025`);
    console.log(`  POST ${p}: ${r.status}`);
  }

  // 10. Cleanup
  console.log("\n=== 10. Cleanup ===");
  for (const aid of createdAssetIds.reverse()) {
    const del = await api("DELETE", `/asset/${aid}`);
    console.log(`  DELETE asset ${aid}: ${del.status}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
