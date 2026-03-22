/**
 * Task 30 — Investigate the CORRECT Tripletex year-end flow:
 * 1. Register assets in asset register
 * 2. Find depreciation endpoints
 * 3. Find how to GENERATE depreciation from assets
 * 4. Check if yearEnd then populates tangibleFixedAssets
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
  // 1. Search OpenAPI for ALL /asset paths
  console.log("=== 1. ALL /asset OpenAPI paths ===");
  const specRes = await fetch(`${BASE}/openapi.json`, { headers: { Authorization: AUTH } });
  const spec = await specRes.json();
  for (const [path, methods] of Object.entries(spec.paths || {})) {
    if (path.startsWith("/asset")) {
      const methodNames = Object.keys(methods as any).filter(m => m !== "parameters");
      for (const m of methodNames) {
        const op = (methods as any)[m];
        console.log(`  ${m.toUpperCase()} ${path}: ${op.summary || ''}`);
        if (op.description) console.log(`    desc: ${op.description.slice(0, 300)}`);
      }
    }
  }

  // 2. Search for depreciation/write-off endpoints
  console.log("\n=== 2. Depreciation endpoints ===");
  for (const [path, methods] of Object.entries(spec.paths || {})) {
    const lp = path.toLowerCase();
    if (lp.includes("depreciat") || lp.includes("writeoff") || lp.includes("write-off") || 
        lp.includes("avskriv") || lp.includes("saldogroup")) {
      const methodNames = Object.keys(methods as any).filter(m => m !== "parameters");
      for (const m of methodNames) {
        const op = (methods as any)[m];
        console.log(`  ${m.toUpperCase()} ${path}: ${op.summary || ''}`);
        if (op.description) console.log(`    desc: ${op.description.slice(0, 300)}`);
      }
    }
  }

  // 3. Look at Asset schema in detail — especially depreciation-related fields
  console.log("\n=== 3. Asset schema details ===");
  const schemas = spec.components?.schemas || spec.definitions || {};
  const assetSchema = schemas["Asset"] as any;
  if (assetSchema?.properties) {
    for (const [pk, pv] of Object.entries(assetSchema.properties as Record<string, any>)) {
      const desc = pv.description ? ` — ${pv.description.slice(0, 100)}` : '';
      const enumVals = pv.enum ? ` [${pv.enum.join(", ")}]` : '';
      console.log(`  ${pk}: ${pv.type || pv['$ref'] || '?'}${enumVals}${desc}`);
    }
  }

  // 4. Create assets properly with depreciation method and all fields
  console.log("\n=== 4. Create 3 assets with full depreciation config ===");
  const acctRes = await api("GET", "/ledger/account?number=1209,1210,1240,1250,6010&fields=id,number,name");
  const accts: Record<number, number> = {};
  for (const a of (acctRes.data.values || [])) {
    accts[a.number] = a.id;
    console.log(`  Account ${a.number}: id=${a.id} "${a.name}"`);
  }

  // Create missing 1209 if needed
  if (!accts[1209]) {
    const c = await api("POST", "/ledger/account", { number: 1209, name: "Akkumulerte avskrivninger" });
    accts[1209] = c.data.value.id;
    console.log(`  Created 1209: id=${accts[1209]}`);
  }

  const assets = [
    { name: "IT-utstyr", cost: 204150, life: 4, acct: 1210 },
    { name: "Inventar", cost: 237550, life: 8, acct: 1240 },
    { name: "Programvare", cost: 307500, life: 4, acct: 1250 },
  ];

  const createdAssetIds: number[] = [];
  for (const a of assets) {
    const asset = await api("POST", "/asset", {
      name: a.name,
      dateOfAcquisition: "2020-01-15",
      acquisitionCost: a.cost,
      account: { id: accts[a.acct] },
      lifetime: a.life,
      depreciationAccount: { id: accts[1209] },
      depreciationMethod: "STRAIGHT_LINE",
      depreciationFrom: "2020-01-15",
    });
    console.log(`  POST /asset "${a.name}": ${asset.status}`);
    if (asset.ok) {
      createdAssetIds.push(asset.data.value.id);
      // Show depreciation fields
      const d = asset.data.value;
      console.log(`    id=${d.id}, annualDep=${d.annualDepreciation}, depAmount=${d.depreciationAmount}, depMethod=${d.depreciationMethod}, accDep=${d.accumulatedDepreciation}`);
    } else {
      console.log(`    Error: ${JSON.stringify(asset.data).slice(0, 300)}`);
    }
  }

  // 5. Check asset postings
  console.log("\n=== 5. Asset postings ===");
  if (createdAssetIds.length > 0) {
    const postings = await api("GET", `/asset/${createdAssetIds[0]}/postings`);
    console.log(`  GET /asset/${createdAssetIds[0]}/postings: ${postings.status}`);
    console.log(`  ${JSON.stringify(postings.data).slice(0, 500)}`);
  }

  // 6. GET asset with full fields
  console.log("\n=== 6. Asset full fields ===");
  if (createdAssetIds.length > 0) {
    const full = await api("GET", `/asset/${createdAssetIds[0]}?fields=*`);
    if (full.ok) {
      const d = full.data.value;
      for (const [k, v] of Object.entries(d)) {
        if (typeof v !== 'object' || v === null) {
          console.log(`  ${k}: ${JSON.stringify(v)}`);
        }
      }
    }
  }

  // 7. Check yearEnd now with assets
  console.log("\n=== 7. YearEnd tangibleFixedAssets ===");
  const ye = await api("GET", "/yearEnd?fields=*");
  if (ye.ok) {
    console.log(`  tangibleFixedAssets: ${JSON.stringify(ye.data.value.tangibleFixedAssets).slice(0, 1000)}`);
    console.log(`  showInfoSumDepreciation: ${ye.data.value.showInfoSumDepreciation}`);
  }

  // 8. Check for yearEnd depreciation-specific paths
  console.log("\n=== 8. YearEnd depreciation paths ===");
  const yeDepPaths = [
    "/yearEnd/depreciation",
    "/yearEnd/0/depreciation",
    "/yearEnd/0/asset",
    "/yearEnd/generateDepreciation",
    "/yearEnd/calculateDepreciation",
    "/yearEnd/postDepreciation",
  ];
  for (const p of yeDepPaths) {
    const r = await api("GET", p);
    if (r.status !== 404 && r.status !== 422) {
      console.log(`  GET ${p}: ${r.status} — ${JSON.stringify(r.data).slice(0, 300)}`);
    }
  }

  // 9. Try POST/PUT endpoints that might generate depreciation
  console.log("\n=== 9. Try generating depreciation ===");
  const genPaths = [
    { method: "POST", path: "/yearEnd/depreciation" },
    { method: "POST", path: "/yearEnd/0/depreciation" },
    { method: "PUT", path: "/yearEnd/0" },
    { method: "POST", path: "/asset/depreciation" },
  ];
  for (const { method, path } of genPaths) {
    const r = await api(method, path, { year: 2025 });
    if (r.status !== 404) {
      console.log(`  ${method} ${path}: ${r.status} — ${JSON.stringify(r.data).slice(0, 300)}`);
    }
  }

  // 10. Cleanup
  console.log("\n=== 10. Cleanup ===");
  for (const id of createdAssetIds.reverse()) {
    const del = await api("DELETE", `/asset/${id}`);
    console.log(`  DELETE /asset/${id}: ${del.status}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
