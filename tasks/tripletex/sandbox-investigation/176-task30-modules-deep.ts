/**
 * Task 30 — Deep module investigation:
 * 1. Full company/modules dump
 * 2. Available sales modules
 * 3. Can we activate asset/yearEnd modules?
 * 4. Full yearEnd/annualAccounts dump
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
  // 1. Full company/modules
  console.log("=== 1. FULL company/modules ===");
  const mods = await api("GET", "/company/modules");
  if (mods.ok) {
    const d = mods.data.value;
    for (const [k, v] of Object.entries(d)) {
      console.log(`  ${k}: ${v}`);
    }
  }

  // 2. Sales modules available
  console.log("\n=== 2. Sales modules (GET) ===");
  const sales = await api("GET", "/company/salesmodules");
  console.log(`  Status: ${sales.status}`);
  if (sales.ok) {
    console.log(JSON.stringify(sales.data, null, 2).slice(0, 3000));
  } else {
    console.log(JSON.stringify(sales.data).slice(0, 500));
  }

  // 3. Subscription packages  
  console.log("\n=== 3. Subscription packages ===");
  const pkgs = await api("GET", "/subscription/packages");
  if (pkgs.ok) {
    console.log(JSON.stringify(pkgs.data, null, 2).slice(0, 3000));
  } else {
    console.log(`  ${pkgs.status}: ${JSON.stringify(pkgs.data).slice(0, 500)}`);
  }

  // 4. Full yearEnd/annualAccounts 
  console.log("\n=== 4. Full yearEnd/annualAccounts ===");
  const aa = await api("GET", "/yearEnd/annualAccounts?year=2025&fields=*");
  if (aa.ok) {
    console.log(JSON.stringify(aa.data.value, null, 2).slice(0, 5000));
  }

  // 5. Try to find yearEnd-specific OpenAPI schemas for signers, notes, etc.
  console.log("\n=== 5. YearEnd signers and notes ===");
  const signers = await api("GET", "/yearEnd/signer?year=2025");
  console.log(`  GET /yearEnd/signer?year=2025: ${signers.status}`);
  if (signers.ok) console.log(JSON.stringify(signers.data).slice(0, 500));

  const notes = await api("GET", "/yearEnd/note?year=2025");
  console.log(`  GET /yearEnd/note?year=2025: ${notes.status}`);
  if (notes.ok) console.log(JSON.stringify(notes.data).slice(0, 500));
  
  // 6. Try yearEnd/steps
  console.log("\n=== 6. YearEnd steps ===");
  const steps = await api("GET", "/yearEnd/step?year=2025");
  console.log(`  GET /yearEnd/step?year=2025: ${steps.status}`);
  if (steps.ok) console.log(JSON.stringify(steps.data).slice(0, 1000));
  else console.log(JSON.stringify(steps.data).slice(0, 300));

  // 7. Try to activate asset module via salesmodules POST
  console.log("\n=== 7. Try activating asset module ===");
  // First, let's see what the POST schema expects
  const specRes = await fetch(`${BASE}/openapi.json`, { headers: { Authorization: AUTH } });
  const spec = await specRes.json();
  const salesPost = spec.paths?.["/company/salesmodules"]?.post;
  if (salesPost) {
    console.log("  POST /company/salesmodules:");
    console.log("  Summary:", salesPost.summary);
    console.log("  Description:", salesPost.description?.slice(0, 300));
    const body = salesPost.requestBody?.content?.["application/json"];
    if (body?.schema) {
      const ref = body.schema["$ref"];
      if (ref) {
        const schemaName = ref.split("/").pop();
        const schema = spec.components?.schemas?.[schemaName] || spec.definitions?.[schemaName];
        if (schema) {
          console.log(`  Schema (${schemaName}):`, JSON.stringify(schema.properties ? Object.keys(schema.properties) : schema, null, 2).slice(0, 500));
        }
      }
    }
    // Check parameters
    if (salesPost.parameters) {
      console.log("  Parameters:", JSON.stringify(salesPost.parameters).slice(0, 500));
    }
  }

  // 8. Search for TangibleFixedAsset-related paths specifically
  console.log("\n=== 8. TangibleFixedAsset paths ===");
  for (const [path, methods] of Object.entries(spec.paths || {})) {
    if (path.toLowerCase().includes("tangible") || path.toLowerCase().includes("fixedasset")) {
      const methodNames = Object.keys(methods as any).filter(m => m !== "parameters");
      for (const m of methodNames) {
        const op = (methods as any)[m];
        console.log(`  ${m.toUpperCase()} ${path}: ${op.summary || ''}`);
      }
    }
  }

  // 9. Try yearEnd tangibleFixedAssets overview
  console.log("\n=== 9. YearEnd tangibleFixedAssets overview ===");
  const tfa = await api("GET", "/yearEnd/tangibleFixedAssetsOverview?year=2025");
  console.log(`  GET /yearEnd/tangibleFixedAssetsOverview?year=2025: ${tfa.status}`);
  if (tfa.ok) console.log(JSON.stringify(tfa.data).slice(0, 1000));
  else console.log(JSON.stringify(tfa.data).slice(0, 300));
}

main().catch(e => { console.error(e); process.exit(1); });
