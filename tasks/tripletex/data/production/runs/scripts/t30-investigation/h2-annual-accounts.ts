// Hypothesis 2: Annual accounts or close group needed
// Maybe the task requires interacting with /ledger/annualAccount or /ledger/closeGroup

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (res.status >= 400) {
    console.error("ERROR:", typeof data === 'string' ? data.slice(0, 1000) : JSON.stringify(data).slice(0, 1000));
  }
  return { status: res.status, data };
}

async function main() {
  // Test 2a: GET /ledger/annualAccount
  console.log("=== Annual Account ===");
  const aa1 = await api("GET", "/ledger/annualAccount?yearFrom=2025&yearTo=2026&fields=*");
  if (aa1.status === 200) {
    console.log("Annual accounts:", JSON.stringify(aa1.data).slice(0, 2000));
  }

  // Also try year 2025 specifically
  const aa2 = await api("GET", "/ledger/annualAccount?yearFrom=2025&yearTo=2025&fields=*");
  if (aa2.status === 200) {
    console.log("Annual accounts 2025:", JSON.stringify(aa2.data).slice(0, 2000));
  }

  // Test 2b: GET /ledger/closeGroup
  console.log("\n=== Close Group ===");
  const cg1 = await api("GET", "/ledger/closeGroup?dateFrom=2025-01-01&dateTo=2026-01-01&fields=*");
  if (cg1.status === 200) {
    console.log("Close groups:", JSON.stringify(cg1.data).slice(0, 2000));
  }

  // Also try without date filter
  const cg2 = await api("GET", "/ledger/closeGroup?fields=*&count=50");
  if (cg2.status === 200) {
    console.log("All close groups:", JSON.stringify(cg2.data).slice(0, 2000));
  }

  // Test 2c: Check if there's a /yearEndReport endpoint
  console.log("\n=== Year-End Report ===");
  const yer = await api("GET", "/yearEndReport?year=2025&fields=*");

  // Test 2d: Check /resultBudget or other reporting endpoints
  console.log("\n=== Result Budget ===");
  const rb = await api("GET", "/resultBudget?year=2025&fields=*");

  // Test 2e: Check /ledger/annualAccount for POST ability
  console.log("\n=== POST annual account ===");
  const postAa = await api("POST", "/ledger/annualAccount", { year: 2025 });

  // Test 2f: Check /ledger/closeGroup for POST ability
  console.log("\n=== POST close group ===");
  const postCg = await api("POST", "/ledger/closeGroup", {
    date: "2025-12-31",
    description: "Årsavslutning 2025"
  });
}

main().catch(e => { console.error(e); process.exit(1); });
