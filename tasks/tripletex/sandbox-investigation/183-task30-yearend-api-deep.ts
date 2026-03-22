/**
 * Task 30 — Deep investigation of yearEnd API endpoints.
 * Goal: Find if there's a yearEnd "submit" or "finalize" or "generate" endpoint
 * that actually creates the year-end postings, rather than us manually posting vouchers.
 *
 * Also explores: what happens AFTER activating YEAR_END_REPORTING_AS module.
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok && res.status !== 404 && res.status !== 405 && res.status !== 403) {
    console.error("  ERROR:", typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data, null, 2).slice(0, 500));
  }
  return { status: res.status, data };
}

async function main() {
  // 1. Check current module state
  console.log("=== 1. Current module state ===");
  const mods = await api("GET", "/company/modules");
  if (mods.status === 200) {
    const d = mods.data.value;
    console.log("  moduleYearEndReport:", d.moduleYearEndReport);
    console.log("  moduleFixedAssetRegister:", d.moduleFixedAssetRegister);
    console.log("  moduleSimplifiedYearEnd:", d.moduleSimplifiedYearEnd);
    // Look for any yearEnd-related module flags
    for (const [k, v] of Object.entries(d)) {
      if (k.toLowerCase().includes("year") || k.toLowerCase().includes("annual") || k.toLowerCase().includes("asset") || k.toLowerCase().includes("report")) {
        console.log(`  ${k}: ${v}`);
      }
    }
  }

  // 2. Ensure modules are activated
  console.log("\n=== 2. Activate year-end modules ===");
  for (const mod of ["YEAR_END_REPORTING_AS", "FIXED_ASSETS_REGISTER"]) {
    const r = await api("POST", "/company/salesmodules", { salesModule: mod });
    console.log(`  ${mod}: ${r.status} ${r.status === 201 ? "ACTIVATED" : r.status === 409 ? "ALREADY ACTIVE" : "FAILED"}`);
  }

  // 3. Explore ALL yearEnd-related endpoints
  console.log("\n=== 3. Explore yearEnd endpoints ===");

  const yearEndPaths = [
    // GET endpoints
    ["GET", "/yearEnd"],
    ["GET", "/yearEnd?year=2025"],
    ["GET", "/yearEnd?year=2025&fields=*"],
    ["GET", "/yearEnd/annualAccounts?year=2025"],
    ["GET", "/yearEnd/annualAccounts?year=2025&fields=*"],
    ["GET", "/yearEnd/report?year=2025"],
    ["GET", "/yearEnd/report?year=2025&fields=*"],

    // POST endpoints — maybe there's a "generate" or "create" action?
    ["POST", "/yearEnd?year=2025"],
    ["POST", "/yearEnd/send?year=2025"],
    ["POST", "/yearEnd/close?year=2025"],
    ["POST", "/yearEnd/generate?year=2025"],
    ["POST", "/yearEnd/create?year=2025"],
    ["POST", "/yearEnd/submit?year=2025"],

    // PUT endpoints — maybe update/finalize?
    ["PUT", "/yearEnd?year=2025"],

    // Year end report posting
    ["GET", "/yearEnd/report/posting?year=2025"],
    ["POST", "/yearEnd/report/posting?year=2025"],

    // Result allocation / disponering
    ["GET", "/yearEnd/resultAllocation?year=2025"],
    ["POST", "/yearEnd/resultAllocation?year=2025"],

    // Note endpoints
    ["GET", "/yearEnd/note?year=2025"],

    // Related: settings
    ["GET", "/yearEnd/settings"],
    ["GET", "/yearEnd/settings?year=2025"],
  ];

  for (const [method, path] of yearEndPaths) {
    const r = await api(method, path);
    if (r.status === 200 || r.status === 201) {
      const summary = JSON.stringify(r.data).slice(0, 300);
      console.log(`  ✓ ${summary}`);
    }
  }

  // 4. OpenAPI search for ALL yearEnd paths with full detail
  console.log("\n=== 4. OpenAPI yearEnd paths (full detail) ===");
  const specRes = await fetch(`${BASE}/openapi.json`, { headers: { Authorization: AUTH } });
  const spec = await specRes.json();

  for (const [path, methods] of Object.entries(spec.paths || {})) {
    const lp = (path as string).toLowerCase();
    if (lp.includes("yearend") || lp.includes("year-end") || lp.includes("year_end")) {
      for (const [method, op] of Object.entries(methods as any)) {
        if (method === "parameters") continue;
        const operation = op as any;
        console.log(`  ${method.toUpperCase()} ${path}`);
        if (operation.summary) console.log(`    summary: ${operation.summary}`);
        if (operation.description) console.log(`    desc: ${operation.description.slice(0, 200)}`);
        if (operation.parameters) {
          for (const p of operation.parameters) {
            console.log(`    param: ${p.name} (${p.in}) ${p.required ? "REQUIRED" : "optional"} — ${p.description?.slice(0, 100) || ""}`);
          }
        }
        // Check request body
        if (operation.requestBody) {
          const content = operation.requestBody.content?.["application/json"];
          if (content?.schema?.$ref) {
            console.log(`    body: ${content.schema.$ref}`);
          }
        }
      }
    }
  }

  // 5. Specifically check for depreciation-related endpoints
  console.log("\n=== 5. Depreciation-related paths ===");
  for (const [path, methods] of Object.entries(spec.paths || {})) {
    const lp = (path as string).toLowerCase();
    if (lp.includes("depreci") || lp.includes("avskriv") || lp.includes("tangible")) {
      for (const [method, op] of Object.entries(methods as any)) {
        if (method === "parameters") continue;
        console.log(`  ${method.toUpperCase()} ${path}: ${(op as any).summary || ""}`);
      }
    }
  }

  // 6. Check existing yearEnd data with all fields
  console.log("\n=== 6. Full yearEnd data ===");
  const ye = await api("GET", "/yearEnd?year=2025&fields=*");
  if (ye.status === 200) {
    const d = ye.data.value;
    // Print all non-null top-level fields
    for (const [k, v] of Object.entries(d)) {
      if (v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) {
        if (typeof v === "object") {
          const s = JSON.stringify(v).slice(0, 200);
          console.log(`  ${k}: ${s}`);
        } else {
          console.log(`  ${k}: ${v}`);
        }
      }
    }
  }

  // 7. Check yearEnd for all available years
  console.log("\n=== 7. YearEnd for different years ===");
  for (const year of [2024, 2025, 2026]) {
    const r = await api("GET", `/yearEnd?year=${year}`);
    if (r.status === 200) {
      const d = r.data.value;
      console.log(`  Year ${year}: status=${d.status}, taxCost=${d.taxCost}, annualResult=${d.annualResult}`);
    }
  }

  // 8. Look for any "settings" or "configuration" that might need to be set
  console.log("\n=== 8. Company settings related to year-end ===");
  const company = await api("GET", "/company?fields=id,name,type,organizationNumber,settings");
  if (company.status === 200) {
    console.log(`  Company: ${company.data.value.name} (type: ${company.data.value.type})`);
  }

  // 9. Check if there's an "annualAccounts" action endpoint
  console.log("\n=== 9. annualAccounts endpoints ===");
  const aaPaths = [
    ["GET", "/yearEnd/annualAccounts?year=2025&fields=*"],
    ["POST", "/yearEnd/annualAccounts?year=2025"],
    ["PUT", "/yearEnd/annualAccounts?year=2025"],
    ["GET", "/yearEnd/annualAccounts/note?year=2025"],
  ];
  for (const [method, path] of aaPaths) {
    const r = await api(method, path);
    if (r.status === 200 || r.status === 201) {
      console.log(`  ✓ ${JSON.stringify(r.data).slice(0, 500)}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
