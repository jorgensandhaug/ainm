/**
 * Task 30 — Try to activate the Fixed Asset Register module.
 * Then check if /asset works and if yearEnd gets tangibleFixedAssets populated.
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
  // 1. Get all available subscription packages to find fixed asset / year-end ones
  console.log("=== 1. All subscription packages ===");
  const pkgs = await api("GET", "/subscription/packages");
  if (pkgs.ok) {
    for (const p of pkgs.data.value) {
      console.log(`  id=${p.id} "${p.title}" active=${p.active} available=${p.available} price=${p.monthlyPrice}`);
    }
  }

  // 2. Try various module names with POST /company/salesmodules
  console.log("\n=== 2. Try activating modules ===");
  const moduleNames = [
    "FIXED_ASSET",
    "FIXED_ASSET_REGISTER",
    "ASSET",
    "ASSET_REGISTER",
    "YEAR_END",
    "YEAREND",
    "SIMPLIFIED_YEAR_END",
    "FORENKLET_ARSOPPGJOR",
  ];
  
  for (const name of moduleNames) {
    const r = await api("POST", "/company/salesmodules", { name });
    console.log(`  POST salesmodules {name:"${name}"}: ${r.status} — ${JSON.stringify(r.data).slice(0, 200)}`);
    if (r.ok) {
      console.log("  *** SUCCESS! ***");
      break;
    }
  }

  // 3. Check if /asset now works
  console.log("\n=== 3. Check /asset after activation attempts ===");
  const assetR = await api("GET", "/asset");
  console.log(`  GET /asset: ${assetR.status} — ${JSON.stringify(assetR.data).slice(0, 300)}`);

  // 4. Check company/modules again
  console.log("\n=== 4. Company modules after activation ===");
  const mods = await api("GET", "/company/modules");
  if (mods.ok) {
    const d = mods.data.value;
    // Only show relevant ones
    for (const [k, v] of Object.entries(d)) {
      if (k.toLowerCase().includes("asset") || k.toLowerCase().includes("fixed") || 
          k.toLowerCase().includes("year") || k.toLowerCase().includes("deprec") ||
          k.toLowerCase().includes("voucher") || k.toLowerCase().includes("digital")) {
        console.log(`  ${k}: ${v}`);
      }
    }
  }

  // 5. Look at OpenAPI for POST /company/salesmodules schema
  console.log("\n=== 5. SalesModule schema from OpenAPI ===");
  const specRes = await fetch(`${BASE}/openapi.json`, { headers: { Authorization: AUTH } });
  const spec = await specRes.json();
  
  // Find the SalesModuleDTO schema
  const schemas = spec.components?.schemas || spec.definitions || {};
  for (const [name, schema] of Object.entries(schemas)) {
    if (name.toLowerCase().includes("salesmodule") || name.toLowerCase().includes("module")) {
      const s = schema as any;
      if (s.properties) {
        console.log(`  Schema: ${name}`);
        for (const [pk, pv] of Object.entries(s.properties as Record<string, any>)) {
          const enumVals = pv.enum ? ` [${pv.enum.join(", ")}]` : '';
          console.log(`    ${pk}: ${pv.type || pv['$ref'] || '?'}${enumVals}`);
        }
      }
    }
  }

  // 6. Try listing ALL existing active modules with more detail
  console.log("\n=== 6. Active sales modules detail ===");
  const activeSales = await api("GET", "/company/salesmodules?fields=*");
  if (activeSales.ok) {
    console.log(JSON.stringify(activeSales.data, null, 2));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
