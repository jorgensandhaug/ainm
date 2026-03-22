/**
 * Task 30 — Exhaustive search of OpenAPI spec for ALL year-end, depreciation, 
 * closing, and tax-related endpoints.
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function main() {
  const specRes = await fetch(`${BASE}/openapi.json`, { headers: { Authorization: AUTH } });
  const spec = await specRes.json();
  
  console.log("=== ALL paths containing year/depreciation/close/tax/module ===\n");
  
  const keywords = ["year", "depreci", "close", "closing", "tax", "module", "asset", "avskriv", "skatt", "årsoppgjør", "arsoppgjor"];
  const paths = Object.keys(spec.paths || {}).sort();
  
  for (const path of paths) {
    const pathLower = path.toLowerCase();
    if (keywords.some(k => pathLower.includes(k))) {
      const methods = Object.keys(spec.paths[path]);
      const details = methods.map(m => {
        const op = spec.paths[path][m];
        return `${m.toUpperCase()}: ${op.summary || op.operationId || ''}`;
      }).join(' | ');
      console.log(`  ${path}`);
      console.log(`    ${details}`);
    }
  }

  // Also search for endpoints with "simplified" or "forenklet"
  console.log("\n=== Paths with simplified/forenklet ===");
  for (const path of paths) {
    const pathLower = path.toLowerCase();
    if (pathLower.includes("simplified") || pathLower.includes("forenklet") || pathLower.includes("simplified")) {
      console.log(`  ${path}`);
    }
  }

  // Search for any endpoints with "report" 
  console.log("\n=== Paths with 'report' ===");
  for (const path of paths) {
    if (path.toLowerCase().includes("report")) {
      const methods = Object.keys(spec.paths[path]);
      console.log(`  ${path} [${methods.join(',')}]`);
    }
  }

  // Search schemas for year-end related
  console.log("\n=== Schemas containing 'yearEnd'/'YearEnd'/'asset' ===");
  const schemas = spec.components?.schemas || spec.definitions || {};
  for (const name of Object.keys(schemas).sort()) {
    if (name.toLowerCase().includes("yearend") || name.toLowerCase().includes("year_end") || name === "Asset" || name.toLowerCase().includes("depreci")) {
      const props = Object.keys((schemas[name] as any).properties || {}).join(', ');
      console.log(`  ${name}: ${props.slice(0, 200)}`);
    }
  }

  // Check for any year-end voucher types
  console.log("\n=== ALL voucher types ===");
  const vtRes = await fetch(`${BASE}/ledger/voucherType?count=100&fields=*`, { headers: { Authorization: AUTH } });
  const vtData = await vtRes.json();
  for (const vt of vtData.values || []) {
    console.log(`  id=${vt.id} name="${vt.name}" internalName="${vt.internalName}"`);
  }

  // Check ALL company/salesmodules
  console.log("\n=== ALL sales modules ===");
  const smRes = await fetch(`${BASE}/company/salesmodules`, { headers: { Authorization: AUTH } });
  const smData = await smRes.json();
  // List ALL possible module enums from OpenAPI
  const salesModuleSchema = schemas["SalesModule"] || schemas["SalesModuleType"] || {};
  const enumValues = (salesModuleSchema as any)?.properties?.name?.enum || [];
  console.log("  Available enum values:", enumValues.slice(0, 30).join(', '));

  // Check what modules are currently active
  const activeModRes = await fetch(`${BASE}/company/modules?fields=*`, { headers: { Authorization: AUTH } });
  const activeMods = await activeModRes.json();
  if (activeMods.value) {
    const v = activeMods.value;
    const activeKeys = Object.entries(v).filter(([k, val]) => val === true).map(([k]) => k);
    console.log("\n  Active module flags:", activeKeys.join(', '));
    
    // Check for any year-end related flags
    const yeFlags = activeKeys.filter(k => k.toLowerCase().includes("year") || k.toLowerCase().includes("asset") || k.toLowerCase().includes("tax") || k.toLowerCase().includes("depreci") || k.toLowerCase().includes("fixed"));
    console.log("  Year-end/asset/tax related flags:", yeFlags.join(', '));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
