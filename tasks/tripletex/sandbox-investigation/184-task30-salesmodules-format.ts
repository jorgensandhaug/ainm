/**
 * Task 30 — Debug salesmodules activation format.
 * The earlier script 178 worked but now 183 fails. Check body format.
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
  if (!res.ok) {
    console.error("  body:", JSON.stringify(body));
    console.error("  response:", typeof data === "string" ? data.slice(0, 400) : JSON.stringify(data, null, 2).slice(0, 600));
  }
  return { status: res.status, data };
}

async function main() {
  // 1. Check OpenAPI schema for POST /company/salesmodules
  console.log("=== 1. OpenAPI schema for salesmodules ===");
  const specRes = await fetch(`${BASE}/openapi.json`, { headers: { Authorization: AUTH } });
  const spec = await specRes.json();

  for (const [path, methods] of Object.entries(spec.paths || {})) {
    if ((path as string).includes("salesmodule") || (path as string).includes("salesModule")) {
      for (const [method, op] of Object.entries(methods as any)) {
        if (method === "parameters") continue;
        console.log(`  ${method.toUpperCase()} ${path}`);
        const operation = op as any;
        if (operation.summary) console.log(`    summary: ${operation.summary}`);
        if (operation.parameters) {
          for (const p of operation.parameters) {
            console.log(`    param: ${p.name} (${p.in}) — ${p.description || ""}`);
            if (p.schema?.enum) console.log(`      enum: ${p.schema.enum.join(", ")}`);
          }
        }
        if (operation.requestBody) {
          const content = operation.requestBody.content;
          if (content) {
            for (const [ct, schema] of Object.entries(content)) {
              console.log(`    body (${ct}): ${JSON.stringify((schema as any).schema).slice(0, 500)}`);
              // Resolve $ref if present
              if ((schema as any).schema?.$ref) {
                const ref = (schema as any).schema.$ref.replace("#/", "").split("/");
                let resolved = spec;
                for (const part of ref) resolved = resolved[part];
                console.log(`    resolved: ${JSON.stringify(resolved).slice(0, 500)}`);
              }
            }
          }
        }
      }
    }
  }

  // 2. Check current active modules
  console.log("\n=== 2. Current active sales modules ===");
  const smRes = await api("GET", "/company/salesmodules?isActive=true&fields=*&count=100");
  if (smRes.status === 200) {
    for (const m of smRes.data.values || []) {
      console.log(`  ${m.name}: active=${m.isActive}`);
    }
  }

  // 3. Check ALL modules (including inactive)
  console.log("\n=== 3. ALL sales modules ===");
  const allRes = await api("GET", "/company/salesmodules?fields=*&count=500");
  if (allRes.status === 200) {
    const vals = allRes.data.values || [];
    // Filter for yearend, asset, report related
    for (const m of vals) {
      const name = (m.name || "").toLowerCase();
      if (name.includes("year") || name.includes("asset") || name.includes("annual") || name.includes("report") || name.includes("årsoppgjør") || name.includes("eiendel")) {
        console.log(`  ${m.name}: active=${m.isActive}, id=${m.id}`);
      }
    }
  }

  // 4. Try different body formats for activation
  console.log("\n=== 4. Try different body formats ===");

  // Format A: salesModule field (what we used)
  const a = await api("POST", "/company/salesmodules", { salesModule: "YEAR_END_REPORTING_AS" });
  console.log(`  Format A (salesModule field): ${a.status}`);

  // Format B: module field
  const b = await api("POST", "/company/salesmodules", { module: "YEAR_END_REPORTING_AS" });
  console.log(`  Format B (module field): ${b.status}`);

  // Format C: name field
  const c = await api("POST", "/company/salesmodules", { name: "YEAR_END_REPORTING_AS" });
  console.log(`  Format C (name field): ${c.status}`);

  // Format D: Just a string in query param
  const d = await api("POST", "/company/salesmodules?salesModule=YEAR_END_REPORTING_AS", undefined);
  console.log(`  Format D (query param): ${d.status}`);

  // Format E: salesModuleName
  const e = await api("POST", "/company/salesmodules", { salesModuleName: "YEAR_END_REPORTING_AS" });
  console.log(`  Format E (salesModuleName field): ${e.status}`);

  // 5. Check company/modules for all year-end flags
  console.log("\n=== 5. All company/modules flags ===");
  const modsRes = await api("GET", "/company/modules");
  if (modsRes.status === 200) {
    const d = modsRes.data.value;
    for (const [k, v] of Object.entries(d)) {
      if (v === true) console.log(`  ✓ ${k}: ${v}`);
    }
  }

  // 6. Try via the proxy to see if format differs
  console.log("\n=== 6. Check production proxy salesmodules schema ===");
  // Can't access production proxy, but let's try the /swagger endpoint
  const swaggerRes = await fetch(`${BASE}/swagger.json`, { headers: { Authorization: AUTH } });
  if (swaggerRes.ok) {
    const sw = await swaggerRes.json();
    for (const [path, methods] of Object.entries(sw.paths || {})) {
      if ((path as string).includes("salesmodule")) {
        console.log(`  Found: ${path}`);
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
