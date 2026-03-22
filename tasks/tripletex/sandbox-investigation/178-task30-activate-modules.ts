/**
 * Task 30 — Activate FIXED_ASSETS_REGISTER and YEAR_END_REPORTING modules.
 * Then test if /asset works and yearEnd gets tangibleFixedAssets.
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

async function main() {
  // 1. Try activating FIXED_ASSETS_REGISTER
  console.log("=== 1. Activate FIXED_ASSETS_REGISTER ===");
  const far = await api("POST", "/company/salesmodules", { name: "FIXED_ASSETS_REGISTER" });
  console.log(`  Status: ${far.status}`);
  console.log(`  Data: ${JSON.stringify(far.data).slice(0, 500)}`);

  // 2. Try activating YEAR_END_REPORTING_AS (AS = limited company)  
  console.log("\n=== 2. Activate YEAR_END_REPORTING_AS ===");
  const yer = await api("POST", "/company/salesmodules", { name: "YEAR_END_REPORTING_AS" });
  console.log(`  Status: ${yer.status}`);
  console.log(`  Data: ${JSON.stringify(yer.data).slice(0, 500)}`);

  // 3. Also try ENK (sole proprietorship) in case the company type is ENK
  console.log("\n=== 3. Activate YEAR_END_REPORTING_ENK ===");
  const yere = await api("POST", "/company/salesmodules", { name: "YEAR_END_REPORTING_ENK" });
  console.log(`  Status: ${yere.status}`);
  console.log(`  Data: ${JSON.stringify(yere.data).slice(0, 500)}`);

  // 4. Check company type
  console.log("\n=== 4. Company type ===");
  const compRes = await api("GET", "/company/1?fields=*");
  if (!compRes.ok) {
    // Try getting company ID first
    const meRes = await api("GET", "/token/session/>whoAmI");
    console.log(`  whoAmI: ${meRes.status} — ${JSON.stringify(meRes.data).slice(0, 300)}`);
  } else {
    const c = compRes.data.value;
    console.log(`  Name: ${c.name}, Type: ${c.type}, OrgNumber: ${c.organizationNumber}`);
  }

  // 5. Check modules now
  console.log("\n=== 5. Company modules after activation ===");
  const mods = await api("GET", "/company/modules");
  if (mods.ok) {
    const d = mods.data.value;
    for (const [k, v] of Object.entries(d)) {
      if (k.toLowerCase().includes("asset") || k.toLowerCase().includes("fixed") || 
          v === true) {
        console.log(`  ${k}: ${v}`);
      }
    }
  }

  // 6. Check active sales modules
  console.log("\n=== 6. Active sales modules ===");
  const sales = await api("GET", "/company/salesmodules");
  if (sales.ok) {
    for (const m of sales.data.values) {
      console.log(`  ${m.name}`);
    }
  }

  // 7. Check /asset
  console.log("\n=== 7. GET /asset ===");
  const assetR = await api("GET", "/asset");
  console.log(`  Status: ${assetR.status}`);
  console.log(`  Data: ${JSON.stringify(assetR.data).slice(0, 500)}`);

  // 8. If asset works, try creating one
  if (assetR.ok || assetR.status !== 403) {
    console.log("\n=== 8. Create test asset ===");
    // Need to find the account for the asset
    const acctRes = await api("GET", "/ledger/account?number=1210,1209&fields=id,number,name");
    const accts: Record<number, number> = {};
    for (const a of (acctRes.data.values || [])) {
      accts[a.number] = a.id;
      console.log(`  Account ${a.number}: id=${a.id} "${a.name}"`);
    }
    
    if (accts[1210]) {
      const asset = await api("POST", "/asset", {
        name: "Test IT-utstyr",
        dateOfAcquisition: "2020-01-15",
        acquisitionCost: 204150,
        account: { id: accts[1210] },
        lifetime: 4,
        depreciationAccount: accts[1209] ? { id: accts[1209] } : undefined,
      });
      console.log(`  POST /asset: ${asset.status}`);
      console.log(`  Data: ${JSON.stringify(asset.data).slice(0, 1000)}`);

      // Check yearEnd now
      if (asset.ok) {
        console.log("\n=== 9. YearEnd after creating asset ===");
        const ye = await api("GET", "/yearEnd?fields=tangibleFixedAssets,yearEndReportPosting,taxCost");
        console.log(`  tangibleFixedAssets: ${JSON.stringify(ye.data?.value?.tangibleFixedAssets).slice(0, 500)}`);
        console.log(`  yearEndReportPosting: ${JSON.stringify(ye.data?.value?.yearEndReportPosting).slice(0, 500)}`);

        // Clean up
        console.log("\n=== 10. Cleanup — delete asset ===");
        const del = await api("DELETE", `/asset/${asset.data.value.id}`);
        console.log(`  DELETE /asset/${asset.data.value.id}: ${del.status}`);
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
