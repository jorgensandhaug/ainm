/**
 * Task 30 — Investigate yearEnd steps, asset depreciation, and the 
 * full YearEndReport structure to find what checks 4+5 might verify.
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
  return { status: res.status, data, ok: res.ok };
}

async function main() {
  // 1. Full yearEnd report with ALL fields
  console.log("=== 1. Full yearEnd Report ===");
  const ye = await api("GET", "/yearEnd?year=2025&fields=*");
  if (ye.ok) {
    const v = ye.data.value;
    // Print ALL top-level keys and their types/values
    for (const key of Object.keys(v).sort()) {
      const val = v[key];
      if (val === null) {
        console.log(`  ${key}: null`);
      } else if (typeof val === 'object') {
        if ('sumAmount' in val) {
          console.log(`  ${key}: { sumAmount: ${val.sumAmount}, posts: ${val.posts?.length || 0} }`);
        } else if (Array.isArray(val)) {
          console.log(`  ${key}: [${val.length} items]`);
        } else {
          console.log(`  ${key}: ${JSON.stringify(val).slice(0, 150)}`);
        }
      } else {
        console.log(`  ${key}: ${val}`);
      }
    }
  }

  // 2. Check for yearEnd steps
  console.log("\n=== 2. yearEnd Steps (OpenAPI) ===");
  const specRes = await fetch(`${BASE}/openapi.json`, { headers: { Authorization: AUTH } });
  const spec = await specRes.json();
  
  // Search ALL paths for yearEnd
  const yePathsAll = Object.entries(spec.paths || {}).filter(([p]) => p.includes("yearEnd"));
  for (const [path, ops] of yePathsAll) {
    const methods = Object.entries(ops as any).filter(([m]) => ['get','post','put','delete','patch'].includes(m));
    for (const [method, op] of methods) {
      const o = op as any;
      console.log(`  ${method.toUpperCase()} ${path}: ${o.summary || o.operationId || ''}`);
    }
  }

  // 3. Try getting yearEnd with specific fields for steps
  console.log("\n=== 3. yearEnd with step-related fields ===");
  const yeSteps = await api("GET", "/yearEnd?year=2025&fields=id,status,yearEndReportBasicData,altinnMetadata");
  if (yeSteps.ok) {
    console.log("  yearEndReportBasicData:", JSON.stringify(yeSteps.data.value.yearEndReportBasicData)?.slice(0, 500));
    console.log("  altinnMetadata:", JSON.stringify(yeSteps.data.value.altinnMetadata)?.slice(0, 300));
  }

  // 4. Check the yearEnd annual accounts in detail
  console.log("\n=== 4. yearEnd Annual Accounts (detailed) ===");
  const yea = await api("GET", "/yearEnd/annualAccounts?year=2025&fields=*");
  if (yea.ok) {
    const v = yea.data.value;
    for (const key of Object.keys(v).sort()) {
      const val = v[key];
      if (val === null) continue;
      if (typeof val === 'object' && 'sumAmount' in val) {
        console.log(`  ${key}: sumAmount=${val.sumAmount}`);
        if (val.posts) {
          for (const post of val.posts) {
            if (post.sumAmount !== 0) {
              console.log(`    ${post.name}: ${post.sumAmount} (${post.grouping})`);
            }
          }
        }
      } else if (typeof val !== 'object') {
        console.log(`  ${key}: ${val}`);
      }
    }
  }

  // 5. Check the SalesModule enum fully
  console.log("\n=== 5. Full SalesModule Enum ===");
  const schemas = spec.components?.schemas || {};
  const smSchema = schemas["SalesModule"];
  if (smSchema) {
    const nameEnum = smSchema.properties?.name?.enum || [];
    console.log("  Total enum values:", nameEnum.length);
    for (const v of nameEnum) {
      if (v.toLowerCase().includes("year") || v.toLowerCase().includes("asset") || v.toLowerCase().includes("tax") || v.toLowerCase().includes("depreci") || v.toLowerCase().includes("fixed")) {
        console.log(`  ★ ${v}`);
      }
    }
    // Show all
    console.log("  All:", nameEnum.join(', '));
  }

  // 6. Try the GET /company/salesmodules to see active modules
  console.log("\n=== 6. Active Sales Modules ===");
  const smRes = await api("GET", "/company/salesmodules");
  if (smRes.ok) {
    // It returns the active modules
    console.log("  Response:", JSON.stringify(smRes.data).slice(0, 500));
  }

  // 7. Try GET /yearEnd with id to see the full structure
  console.log("\n=== 7. yearEnd ID-based access ===");
  // The yearEnd might have an ID we need
  if (ye.ok) {
    const yeId = ye.data.value.id;
    console.log(`  yearEnd id: ${yeId}`);
    
    // Try getting notes
    const notesRes = await api("GET", `/yearEnd/${yeId}/researchAndDevelopment2024`);
    console.log(`  R&D 2024: ${notesRes.status}`);
    
    // Try getting comments
    // ListResponseYearEndReportNote - maybe there's an endpoint
    const paths = [
      `/yearEnd/${yeId}/notes`,
      `/yearEnd/${yeId}/steps`,
      `/yearEnd/${yeId}/stepItems`,
    ];
    for (const p of paths) {
      const r = await api("GET", p);
      console.log(`  GET ${p}: ${r.status}`);
    }
  }

  // 8. Check balance sheet for the ENTIRE chart (1000-9999) to see what accounts have data
  console.log("\n=== 8. All accounts with balances (1000-9999) ===");
  const bsAll = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=1000&accountNumberTo=9999&fields=account(number,name),balanceOut&count=2000");
  if (bsAll.ok) {
    for (const r of bsAll.data.values) {
      if (r.balanceOut !== 0) {
        console.log(`  ${r.account?.number} ${r.account?.name}: ${r.balanceOut}`);
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
