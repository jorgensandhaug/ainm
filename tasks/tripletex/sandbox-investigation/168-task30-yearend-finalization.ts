/**
 * Task 30 — Deep investigation of yearEnd API and finalization.
 *
 * Questions:
 * 1. Is there a yearEnd finalization endpoint (POST/PUT)?
 * 2. What does the yearEnd API status field say?
 * 3. What does /resultSheet return vs /balanceSheet?
 * 4. What does yearEnd show for prepaid reversal and tax?
 * 5. What are yearEndReportPosting entries?
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
  // 1. Check yearEnd API full state
  console.log("=== 1. yearEnd API full state ===");
  const ye = await api("GET", "/yearEnd?fields=*");
  if (ye.ok) {
    const d = ye.data.value;
    console.log(`  id: ${d.id}`);
    console.log(`  version: ${d.version}`);
    console.log(`  status: ${d.status}`);
    console.log(`  sentDate: ${d.sentDate}`);
    console.log(`  annualResult: ${d.annualResult}`);
    console.log(`  year: ${d.year}`);

    // Check ALL fields for clues
    const keys = Object.keys(d);
    console.log(`  All keys: ${keys.join(', ')}`);

    // Check yearEndReportPosting
    if (d.yearEndReportPosting) {
      console.log(`\n  yearEndReportPosting:`);
      console.log(JSON.stringify(d.yearEndReportPosting, null, 2).slice(0, 2000));
    }

    // Check taxCost section
    if (d.taxCost) {
      console.log(`\n  taxCost section:`);
      console.log(JSON.stringify(d.taxCost, null, 2));
    } else {
      console.log(`\n  taxCost: null`);
    }

    // Check operatingExpense section (for prepaid reversal)
    if (d.operatingExpense) {
      console.log(`\n  operatingExpense (account 6300/7500 should appear here):`);
      for (const p of d.operatingExpense.posts || []) {
        console.log(`    ${p.groupNumber} "${p.name}" grouping=${p.grouping}: ${p.sumAmount}`);
      }
    }

    // Check currentAsset section (for 1700 prepaid)
    if (d.currentAsset) {
      console.log(`\n  currentAsset (account 1700 should appear here):`);
      for (const p of d.currentAsset.posts || []) {
        console.log(`    ${p.groupNumber} "${p.name}" grouping=${p.grouping}: ${p.sumAmount}`);
      }
    }
  } else {
    console.log(`  ERROR ${ye.status}: ${JSON.stringify(ye.data).slice(0, 500)}`);
  }

  // 2. Try resultSheet endpoint
  console.log("\n=== 2. resultSheet API ===");
  const rs = await api("GET", "/resultSheet?dateFrom=2025-01-01&dateTo=2026-01-01&fields=*,account(number,name)&count=1000");
  if (rs.ok) {
    let sum = 0;
    for (const row of (rs.data.values || [])) {
      if (Math.abs(row.balanceOut || 0) > 0.01) {
        console.log(`  ${row.account?.number} "${row.account?.name}": ${row.balanceOut}`);
        sum += row.balanceOut || 0;
      }
    }
    console.log(`  Total: ${sum}, profit: ${-sum}`);
  } else {
    console.log(`  ERROR ${rs.status}: ${JSON.stringify(rs.data).slice(0, 500)}`);
  }

  // 3. Try various yearEnd sub-endpoints
  console.log("\n=== 3. yearEnd sub-endpoints ===");
  const subPaths = [
    "/yearEnd?fields=id,version,status,sentDate,annualResult,year,yearEndReportPosting(*)",
    "/yearEnd/enumType/businessActivityTypes",
  ];
  for (const p of subPaths) {
    const r = await api("GET", p);
    console.log(`  GET ${p}: ${r.status}`);
    if (r.ok) {
      console.log(`    ${JSON.stringify(r.data).slice(0, 300)}`);
    }
  }

  // 4. Try PUT/POST on yearEnd (discover if there's a finalization endpoint)
  console.log("\n=== 4. yearEnd write endpoints ===");
  // Try OPTIONS first
  const opts = await api("OPTIONS", "/yearEnd");
  console.log(`  OPTIONS /yearEnd: ${opts.status}`);

  // Try POST
  const postYe = await api("POST", "/yearEnd");
  console.log(`  POST /yearEnd: ${postYe.status} - ${JSON.stringify(postYe.data).slice(0, 300)}`);

  // Try PUT (if yearEnd has an id)
  if (ye.ok && ye.data.value?.id) {
    const yeId = ye.data.value.id;
    const putYe = await api("PUT", `/yearEnd/${yeId}`, { status: "COMPLETED" });
    console.log(`  PUT /yearEnd/${yeId}: ${putYe.status} - ${JSON.stringify(putYe.data).slice(0, 300)}`);
  }

  // 5. Check if there are yearEnd report posting endpoints
  console.log("\n=== 5. yearEnd report postings ===");
  const yerId = ye.ok ? ye.data.value?.id : null;
  if (yerId) {
    // Try yearEndReportPosting
    const rep = await api("GET", `/yearEnd/${yerId}/yearEndReportPosting?fields=*&count=100`);
    console.log(`  GET /yearEnd/${yerId}/yearEndReportPosting: ${rep.status}`);
    if (rep.ok) {
      console.log(`    ${JSON.stringify(rep.data).slice(0, 1000)}`);
    } else {
      console.log(`    ${JSON.stringify(rep.data).slice(0, 500)}`);
    }
  }

  // 6. Check if the yearEnd has a "generate postings" or "create report" endpoint
  console.log("\n=== 6. More yearEnd discovery ===");
  const morePaths = [
    "/yearEnd/report",
    "/yearEnd/basicData",
    "/yearEnd/settings",
    "/yearEnd/postings",
    "/yearEnd/generate",
    "/yearEnd/calculate",
  ];
  for (const p of morePaths) {
    const r = await api("GET", p);
    console.log(`  GET ${p}: ${r.status}`);
    if (r.ok || r.status !== 404) {
      console.log(`    ${JSON.stringify(r.data).slice(0, 200)}`);
    }
  }

  // 7. Check balance sheet for key accounts
  console.log("\n=== 7. Balance sheet key accounts ===");
  const bs = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=1700&accountNumberTo=1700&fields=*,account(number,name)&count=10");
  if (bs.ok) {
    for (const row of (bs.data.values || [])) {
      console.log(`  1700 balance: balanceIn=${row.balanceIn} balanceOut=${row.balanceOut} balanceChange=${row.balanceChange}`);
    }
  }

  // Check 8300 and 2500
  const bs2 = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8300&accountNumberTo=8300&fields=*,account(number,name)&count=10");
  if (bs2.ok) {
    for (const row of (bs2.data.values || [])) {
      console.log(`  8300 balance: balanceIn=${row.balanceIn} balanceOut=${row.balanceOut}`);
    }
  }

  const bs3 = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=6300&accountNumberTo=6300&fields=*,account(number,name)&count=10");
  if (bs3.ok) {
    for (const row of (bs3.data.values || [])) {
      console.log(`  6300 balance: balanceIn=${row.balanceIn} balanceOut=${row.balanceOut}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
