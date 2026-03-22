/**
 * Task 30 — Search the OpenAPI spec for yearEnd and asset-related paths.
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function main() {
  const res = await fetch(`${BASE}/openapi.json`, {
    headers: { Authorization: "Basic " + btoa(`0:${TOKEN}`) }
  });
  const spec = await res.json();

  // Search for yearEnd, asset, depreciation, tax related paths
  const keywords = ["yearend", "year-end", "asset", "depreciat", "tangible", "fixed", "report"];

  console.log("=== YearEnd and Asset paths ===");
  for (const [path, methods] of Object.entries(spec.paths || {})) {
    const lp = path.toLowerCase();
    if (keywords.some(k => lp.includes(k))) {
      const methodNames = Object.keys(methods as any).filter(m => m !== "parameters");
      console.log(`  ${methodNames.map(m => m.toUpperCase()).join(",")} ${path}`);

      // Show operation details
      for (const m of methodNames) {
        const op = (methods as any)[m];
        if (op.summary) console.log(`    ${m.toUpperCase()}: ${op.summary}`);
        if (op.description) console.log(`    desc: ${op.description.slice(0, 200)}`);
      }
    }
  }

  // Also look for yearEnd schemas
  console.log("\n=== YearEnd schemas ===");
  for (const [name, schema] of Object.entries(spec.components?.schemas || spec.definitions || {})) {
    if (name.toLowerCase().includes("yearend") || name.toLowerCase().includes("asset")) {
      const props = Object.keys((schema as any).properties || {});
      console.log(`  ${name}: ${props.join(", ")}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
