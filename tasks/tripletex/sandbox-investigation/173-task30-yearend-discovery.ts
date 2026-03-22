/**
 * Task 30 — Deep yearEnd API discovery.
 *
 * User hint: "Can you get all of the fields after a run with this pipeline? If you cant that may be it"
 *
 * Goal: Find any yearEnd-related endpoints we've missed, and check if there's
 * a way to populate yearEndReportPosting or tangibleFixedAssets.
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
  // 1. Try the Swagger/OpenAPI endpoint to find all yearEnd-related paths
  console.log("=== 1. OpenAPI discovery ===");
  const swagger = await api("GET", "/swagger.json");
  if (swagger.ok && swagger.data.paths) {
    const yearEndPaths = Object.keys(swagger.data.paths).filter((p: string) =>
      p.toLowerCase().includes("yearend") || p.toLowerCase().includes("year-end") ||
      p.toLowerCase().includes("year_end") || p.toLowerCase().includes("asset")
    );
    console.log(`Found ${yearEndPaths.length} yearEnd/asset paths:`);
    for (const p of yearEndPaths) {
      const methods = Object.keys(swagger.data.paths[p]);
      console.log(`  ${methods.join(",").toUpperCase()} ${p}`);
    }
  } else {
    console.log(`  swagger.json: ${swagger.status}`);
  }

  // 2. Try /api-docs or /v2-docs
  console.log("\n=== 2. API docs discovery ===");
  for (const docPath of ["/swagger.json", "/api-docs", "/openapi.json"]) {
    const r = await api("GET", docPath);
    console.log(`  ${docPath}: ${r.status} (${typeof r.data === 'object' ? (r.data.paths ? Object.keys(r.data.paths).length + ' paths' : 'object') : 'text'})`);
  }

  // 3. Exhaustive yearEnd endpoint probing
  console.log("\n=== 3. Exhaustive yearEnd endpoints ===");
  const yearEndEndpoints = [
    "/yearEnd",
    "/yearEnd/0",
    "/yearEnd/basicData",
    "/yearEnd/report",
    "/yearEnd/reportPosting",
    "/yearEnd/posting",
    "/yearEnd/postings",
    "/yearEnd/tangibleFixedAssets",
    "/yearEnd/asset",
    "/yearEnd/assets",
    "/yearEnd/depreciation",
    "/yearEnd/tax",
    "/yearEnd/taxCost",
    "/yearEnd/prepaid",
    "/yearEnd/generate",
    "/yearEnd/calculate",
    "/yearEnd/create",
    "/yearEnd/settings",
    "/yearEnd/note",
    "/yearEnd/notes",
    "/yearEnd/send",
    "/yearEnd/submit",
    "/yearEnd/complete",
    "/yearEnd/finalize",
    "/yearEnd/close",
    "/yearEnd/reopen",
    "/yearEnd/inventory",
    "/yearEnd/wealth",
  ];
  for (const p of yearEndEndpoints) {
    const r = await api("GET", p);
    if (r.status !== 404) {
      console.log(`  GET ${p}: ${r.status} — ${JSON.stringify(r.data).slice(0, 200)}`);
    }
  }

  // 4. Check asset-related endpoints
  console.log("\n=== 4. Asset endpoints ===");
  const assetEndpoints = [
    "/asset",
    "/asset/list",
    "/ledger/asset",
    "/fixedAsset",
    "/tangibleFixedAsset",
    "/company/asset",
  ];
  for (const p of assetEndpoints) {
    const r = await api("GET", p);
    if (r.status !== 404) {
      console.log(`  GET ${p}: ${r.status} — ${JSON.stringify(r.data).slice(0, 300)}`);
    } else {
      console.log(`  GET ${p}: 404`);
    }
  }

  // 5. Check what /yearEnd returns with different field expansions
  console.log("\n=== 5. yearEnd field expansions ===");
  const expansions = [
    "tangibleFixedAssets(*)",
    "yearEndReportPosting(*)",
    "yearEndReportBasicData(*)",
    "wealthFromBusinessActivity(*)",
    "inventories(*)",
  ];
  for (const e of expansions) {
    const r = await api("GET", `/yearEnd?fields=${e}`);
    if (r.ok) {
      const val = r.data.value?.[e.replace("(*)", "")] ?? "NOT IN RESPONSE";
      console.log(`  fields=${e}: ${JSON.stringify(val).slice(0, 300)}`);
    } else {
      console.log(`  fields=${e}: ${r.status}`);
    }
  }

  // 6. Check if there's a resultBudget or P&L endpoint
  console.log("\n=== 6. P&L / result endpoints ===");
  const plEndpoints = [
    "/resultSheet",
    "/resultBudget",
    "/profitLoss",
    "/incomeStatement",
    "/resultBudget/year/2025",
    "/ledger/resultSheet",
  ];
  for (const p of plEndpoints) {
    const r = await api("GET", p);
    console.log(`  GET ${p}: ${r.status}`);
    if (r.ok) console.log(`    ${JSON.stringify(r.data).slice(0, 200)}`);
  }

  // 7. Try posting to yearEndReportPosting via different methods
  console.log("\n=== 7. yearEndReportPosting write attempts ===");
  const writeAttempts = [
    { method: "POST", path: "/yearEnd/yearEndReportPosting" },
    { method: "PUT", path: "/yearEnd/yearEndReportPosting" },
    { method: "POST", path: "/yearEnd/reportPosting" },
  ];
  for (const { method, path } of writeAttempts) {
    const body = {
      account: { id: 424191229 }, // 8300
      amount: 42623,
      description: "Skattekostnad 2025"
    };
    const r = await api(method, path, body);
    console.log(`  ${method} ${path}: ${r.status} — ${JSON.stringify(r.data).slice(0, 200)}`);
  }

  // 8. Check if yearEnd has sub-resources by ID
  console.log("\n=== 8. yearEnd by year ===");
  for (const year of ["2024", "2025", "2026"]) {
    const r = await api("GET", `/yearEnd?year=${year}&fields=id,status,annualResult,year`);
    if (r.ok) {
      console.log(`  year=${year}: ${JSON.stringify(r.data.value)}`);
    } else {
      console.log(`  year=${year}: ${r.status}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
