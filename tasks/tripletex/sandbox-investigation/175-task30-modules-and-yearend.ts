/**
 * Task 30 — Investigate:
 * 1. What modules/packages are available and which are enabled
 * 2. Can we activate year-end / asset modules
 * 3. What yearEnd-related endpoints exist in OpenAPI spec
 * 4. After activation, does /asset work?
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
  // 1. Search OpenAPI for module/package/subscription endpoints
  console.log("=== 1. OpenAPI module/package search ===");
  const specRes = await fetch(`${BASE}/openapi.json`, { headers: { Authorization: AUTH } });
  const spec = await specRes.json();
  
  const moduleKeywords = ["module", "package", "subscription", "addon", "feature", "license", "company/with"];
  for (const [path, methods] of Object.entries(spec.paths || {})) {
    const lp = path.toLowerCase();
    if (moduleKeywords.some(k => lp.includes(k))) {
      const methodNames = Object.keys(methods as any).filter(m => m !== "parameters");
      const summaries = methodNames.map(m => {
        const op = (methods as any)[m];
        return `${m.toUpperCase()}: ${op.summary || ''}`;
      }).join("; ");
      console.log(`  ${path} — ${summaries}`);
    }
  }

  // 2. Try company modules endpoint
  console.log("\n=== 2. Company modules ===");
  const companyEndpoints = [
    "/company/modules",
    "/company/settings",
    "/company",
    "/company/with",
    "/addon",
    "/subscription",
    "/modules",
  ];
  for (const p of companyEndpoints) {
    const r = await api("GET", p);
    if (r.status !== 404) {
      const summary = JSON.stringify(r.data).slice(0, 500);
      console.log(`  GET ${p}: ${r.status} — ${summary}`);
    } else {
      console.log(`  GET ${p}: 404`);
    }
  }

  // 3. Check current company info (often has module flags)
  console.log("\n=== 3. Company info with all fields ===");
  const comp = await api("GET", "/company?fields=*");
  if (comp.ok) {
    const d = comp.data.value;
    for (const [k, v] of Object.entries(d)) {
      if (typeof v !== 'object' || v === null) {
        console.log(`  ${k}: ${JSON.stringify(v)}`);
      }
    }
  }

  // 4. Search for yearEnd-related POST/PUT endpoints (not just GET)
  console.log("\n=== 4. YearEnd write endpoints ===");
  for (const [path, methods] of Object.entries(spec.paths || {})) {
    const lp = path.toLowerCase();
    if (lp.includes("yearend") && !lp.includes("penneo") && !lp.includes("research")) {
      const methodNames = Object.keys(methods as any).filter(m => m !== "parameters");
      for (const m of methodNames) {
        const op = (methods as any)[m];
        console.log(`  ${m.toUpperCase()} ${path}: ${op.summary || ''}`);
        if (op.description) console.log(`    desc: ${op.description.slice(0, 300)}`);
        // Show request body schema if POST/PUT
        if ((m === "post" || m === "put") && op.requestBody) {
          const content = op.requestBody.content?.["application/json"];
          if (content?.schema) {
            const ref = content.schema["$ref"] || JSON.stringify(content.schema);
            console.log(`    body: ${ref}`);
          }
        }
      }
    }
  }

  // 5. Check /asset with more detail — what does the 403 say?
  console.log("\n=== 5. Asset endpoint details ===");
  const assetR = await api("GET", "/asset");
  console.log(`  GET /asset: ${assetR.status} — ${JSON.stringify(assetR.data).slice(0, 500)}`);
  
  // 6. Try to find how to enable asset module
  console.log("\n=== 6. Company/with endpoints ===");
  for (const [path, methods] of Object.entries(spec.paths || {})) {
    const lp = path.toLowerCase();
    if (lp.includes("/company/") && !lp.includes("penneo")) {
      const methodNames = Object.keys(methods as any).filter(m => m !== "parameters");
      for (const m of methodNames) {
        const op = (methods as any)[m];
        if (op.summary?.toLowerCase().includes("module") || 
            op.summary?.toLowerCase().includes("feature") ||
            op.summary?.toLowerCase().includes("addon") ||
            op.description?.toLowerCase().includes("module") ||
            lp.includes("module") || lp.includes("addon") || lp.includes("settings")) {
          console.log(`  ${m.toUpperCase()} ${path}: ${op.summary || ''}`);
        }
      }
    }
  }

  // 7. Try yearEnd annualAccounts — this is the official year-end report
  console.log("\n=== 7. YearEnd annual accounts ===");
  const annualEndpoints = [
    "/yearEnd/annualAccounts",
    "/yearEnd/annualAccounts?year=2025",
  ];
  for (const p of annualEndpoints) {
    const r = await api("GET", p);
    console.log(`  GET ${p}: ${r.status}`);
    if (r.ok) console.log(`    ${JSON.stringify(r.data).slice(0, 500)}`);
    else console.log(`    ${JSON.stringify(r.data).slice(0, 300)}`);
  }

  // 8. Search OpenAPI for ALL yearEnd paths (complete list)
  console.log("\n=== 8. ALL yearEnd OpenAPI paths ===");
  for (const [path, methods] of Object.entries(spec.paths || {})) {
    if (path.toLowerCase().includes("yearend")) {
      const methodNames = Object.keys(methods as any).filter(m => m !== "parameters");
      for (const m of methodNames) {
        const op = (methods as any)[m];
        console.log(`  ${m.toUpperCase()} ${path}: ${op.summary || ''}`);
      }
    }
  }

  // 9. Check company/modules endpoints from OpenAPI
  console.log("\n=== 9. Company modules from OpenAPI ===");
  for (const [path, methods] of Object.entries(spec.paths || {})) {
    if (path.startsWith("/company") || path.includes("module") || path.includes("addon")) {
      const methodNames = Object.keys(methods as any).filter(m => m !== "parameters");
      const summaries = methodNames.map(m => `${m.toUpperCase()}: ${(methods as any)[m].summary || ''}`).join("; ");
      console.log(`  ${path} — ${summaries}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
