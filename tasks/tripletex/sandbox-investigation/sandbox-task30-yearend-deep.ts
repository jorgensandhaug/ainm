/**
 * Task 30 — Deep yearEnd investigation
 *
 * Tests:
 * 1. yearEnd response BEFORE any vouchers (baseline)
 * 2. yearEnd after depreciation
 * 3. yearEnd after prepaid reversal (try different contra accounts)
 * 4. yearEnd after tax posting (test 8300 vs 8700)
 * 5. yearEnd after disposition
 * 6. Check yearEnd report endpoints
 * 7. Test YEAR_END_REPORTING_AS module effect
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + Buffer.from(`0:${TOKEN}`).toString("base64");

async function api(method: string, path: string, body?: any, query?: Record<string, string>) {
  let url = `${BASE}${path}`;
  if (query) url += "?" + new URLSearchParams(query).toString();
  const res = await fetch(url, {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) console.log(`  ${method} ${path} → ${res.status}:`, typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200));
  return { status: res.status, data };
}

async function getYearEnd(label: string) {
  console.log(`\n=== yearEnd: ${label} ===`);
  const r = await api("GET", "/yearEnd", undefined, { year: "2025", fields: "*" });
  if (r.status === 200) {
    const v = r.data?.value;
    if (v) {
      // Print key sections
      console.log("  status:", v.status);
      console.log("  annualResult:", v.annualResult);
      console.log("  operatingRevenue:", JSON.stringify(v.operatingRevenue));
      console.log("  operatingExpense:", JSON.stringify(v.operatingExpense));
      console.log("  taxCost:", JSON.stringify(v.taxCost));
      console.log("  fixedAsset:", JSON.stringify(v.fixedAsset));
      console.log("  currentAsset:", JSON.stringify(v.currentAsset));
      console.log("  equity:", JSON.stringify(v.equity));
      console.log("  debt:", JSON.stringify(v.debt));
      console.log("  yearEndReportPosting:", JSON.stringify(v.yearEndReportPosting));
      console.log("  tangibleFixedAssets:", JSON.stringify(v.tangibleFixedAssets));
      console.log("  wealthFromBusinessActivity:", JSON.stringify(v.wealthFromBusinessActivity));
      console.log("  capitalIncome:", JSON.stringify(v.capitalIncome));
      console.log("  capitalCost:", JSON.stringify(v.capitalCost));
      // Print ALL keys
      console.log("  ALL KEYS:", Object.keys(v).join(", "));
    }
  }
  return r;
}

async function getBalanceRange(from: number, to: number, label: string) {
  console.log(`\n--- Balance ${from}-${to}: ${label} ---`);
  const r = await api("GET", "/balanceSheet", undefined, {
    dateFrom: "2025-01-01", dateTo: "2026-01-01",
    accountNumberFrom: String(from), accountNumberTo: String(to),
    fields: "*,account(id,number,name)", count: "100",
  });
  if (r.status === 200) {
    for (const row of r.data?.values ?? []) {
      if (Math.abs(row.balanceOut) > 0.01) {
        console.log(`  ${row.account?.number} ${row.account?.name}: ${row.balanceOut}`);
      }
    }
  }
}

async function main() {
  // Step 0: Check module status
  console.log("\n=== STEP 0: Check modules ===");
  const mods = await api("GET", "/company/salesmodules", undefined, { fields: "*" });
  if (mods.status === 200) {
    const vals = mods.data?.values ?? [];
    const yearEnd = vals.find((m: any) => m.name === "YEAR_END_REPORTING_AS");
    const fixedAssets = vals.find((m: any) => m.name === "FIXED_ASSETS_REGISTER");
    console.log("  YEAR_END_REPORTING_AS:", yearEnd ? `active=${yearEnd.active}` : "not found");
    console.log("  FIXED_ASSETS_REGISTER:", fixedAssets ? `active=${fixedAssets.active}` : "not found");
  }

  // Activate YEAR_END_REPORTING_AS
  console.log("\n=== Activating YEAR_END_REPORTING_AS ===");
  const actRes = await api("POST", "/company/salesmodules", { name: "YEAR_END_REPORTING_AS" });
  console.log("  Result:", actRes.status);

  // Step 1: Baseline yearEnd
  await getYearEnd("BASELINE (after module activation)");

  // Step 2: Check yearEnd report endpoints
  console.log("\n=== STEP 2: Probe yearEnd report endpoints ===");
  // Try to find/create a yearEnd report
  const yeReport = await api("GET", "/yearEnd", undefined, { year: "2025", fields: "id,status,yearEndReport(*)" });
  console.log("  yearEnd with yearEndReport:", yeReport.status, JSON.stringify(yeReport.data).slice(0, 500));

  // Try yearEnd with ALL possible fields
  const yeAll = await api("GET", "/yearEnd", undefined, { year: "2025", fields: "id,status,annualResult,yearEndReportBasicData(*),yearEndReportPosting(*),netProfitOrLossForTheYear,transfers" });
  console.log("  yearEnd extended:", yeAll.status, JSON.stringify(yeAll.data).slice(0, 500));

  // Step 3: Look at prepaid-related balance before
  await getBalanceRange(1700, 1799, "prepaid accounts");
  await getBalanceRange(6000, 6399, "expense accounts 6000-6399");
  await getBalanceRange(7400, 7599, "expense accounts 7400-7599");

  // Step 4: Lookup account 1700 details
  console.log("\n=== STEP 4: Account 1700 details ===");
  const acct1700 = await api("GET", "/ledger/account", undefined, { number: "1700", fields: "*" });
  if (acct1700.status === 200) {
    for (const a of acct1700.data?.values ?? []) {
      console.log("  Account 1700:", JSON.stringify(a));
    }
  }

  // Step 5: Check for yearEnd report creation/management endpoints
  console.log("\n=== STEP 5: Probe report management ===");

  // Try POST /yearEnd to create a report
  const createReport = await api("POST", "/yearEnd", { year: 2025 });
  console.log("  POST /yearEnd:", createReport.status, JSON.stringify(createReport.data).slice(0, 300));

  // Try PUT /yearEnd
  const updateReport = await api("PUT", "/yearEnd", { year: 2025, status: "STARTED" });
  console.log("  PUT /yearEnd:", updateReport.status, JSON.stringify(updateReport.data).slice(0, 300));

  // Try /yearEnd/report
  const reportEndpoint = await api("GET", "/yearEnd/report", undefined, { year: "2025" });
  console.log("  GET /yearEnd/report:", reportEndpoint.status);

  // Try /yearEnd/close
  const closeEndpoint = await api("POST", "/yearEnd/close", { year: 2025 });
  console.log("  POST /yearEnd/close:", closeEndpoint.status);

  // Try /yearEnd/start
  const startEndpoint = await api("POST", "/yearEnd/start", { year: 2025 });
  console.log("  POST /yearEnd/start:", startEndpoint.status);

  // Try /yearEnd/save
  const saveEndpoint = await api("POST", "/yearEnd/save", { year: 2025 });
  console.log("  POST /yearEnd/save:", saveEndpoint.status);

  // Try /yearEnd/{id}/send
  // First get yearEnd id
  const yeId = await api("GET", "/yearEnd", undefined, { year: "2025", fields: "id" });
  const yearEndId = yeId.data?.value?.id;
  console.log("  yearEnd id:", yearEndId);

  if (yearEndId) {
    const sendEndpoint = await api("POST", `/yearEnd/${yearEndId}/send`);
    console.log("  POST /yearEnd/{id}/send:", sendEndpoint.status);

    const yeGet = await api("GET", `/yearEnd/${yearEndId}`, undefined, { fields: "*" });
    console.log("  GET /yearEnd/{id}:", yeGet.status, JSON.stringify(yeGet.data).slice(0, 500));
  }

  // Step 6: Try /yearEnd/annualAccounts
  const annualAccts = await api("GET", "/yearEnd/annualAccounts", undefined, { year: "2025" });
  console.log("  GET /yearEnd/annualAccounts:", annualAccts.status);

  // Try /yearEnd/settings
  const yeSettings = await api("GET", "/yearEnd/settings", undefined, { year: "2025" });
  console.log("  GET /yearEnd/settings:", yeSettings.status, JSON.stringify(yeSettings.data).slice(0, 300));

  // Step 7: Check yearEndReportPosting details
  console.log("\n=== STEP 7: yearEndReportPosting deep dive ===");
  const yePosting = await api("GET", "/yearEnd", undefined, { year: "2025", fields: "yearEndReportPosting(*)," });
  console.log("  yearEndReportPosting:", JSON.stringify(yePosting.data?.value?.yearEndReportPosting));

  // Step 8: Look for the yearEnd voucher type
  console.log("\n=== STEP 8: Look for year-end voucherType ===");
  const voucherTypes = await api("GET", "/ledger/voucher/voucherType", undefined, { fields: "*", count: "100" });
  if (voucherTypes.status === 200) {
    for (const vt of voucherTypes.data?.values ?? []) {
      console.log(`  VoucherType ${vt.id}: ${vt.name}`);
    }
  }

  // Step 9: Summarize all yearEnd sections and what populates them
  console.log("\n=== FINAL SUMMARY ===");
  await getYearEnd("FINAL STATE");
  await getBalanceRange(8000, 8999, "8xxx accounts (tax/result)");
  await getBalanceRange(2000, 2999, "2xxx accounts (equity/payable)");
  await getBalanceRange(1000, 1299, "1xxx accounts (assets/depreciation)");
}

main().catch(console.error);
