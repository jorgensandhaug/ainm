// Check critical things:
// 1. Full sales modules list (was truncated)
// 2. yearEnd report endpoint
// 3. What YEAR_END_REPORTING_AS activation does
// 4. yearEndReportPosting details
// 5. Try to understand checks 4+5

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
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`\n=== ${method} ${path} → ${res.status} ===`);
  if (typeof json === 'object') console.log(JSON.stringify(json, null, 2));
  else console.log(json);
  return { status: res.status, data: json };
}

async function main() {
  // 1. Full sales modules list
  console.log("========== FULL SALES MODULES ==========");
  const sm = await api("GET", "/company/salesmodules?fields=*&count=200");
  const moduleNames = sm.data?.values?.map((v: any) => v.name) || [];
  console.log("\nActive modules:", moduleNames);
  console.log("Has YEAR_END_REPORTING_AS:", moduleNames.includes("YEAR_END_REPORTING_AS"));

  // 2. Try activating the year-end module
  console.log("\n========== ACTIVATE YEAR_END_REPORTING_AS ==========");
  const activate = await api("POST", "/company/salesmodules", { name: "YEAR_END_REPORTING_AS" });

  // 3. Re-check modules after activation
  console.log("\n========== MODULES AFTER ACTIVATION ==========");
  const sm2 = await api("GET", "/company/salesmodules?fields=*&count=200");
  const moduleNames2 = sm2.data?.values?.map((v: any) => v.name) || [];
  console.log("\nActive modules:", moduleNames2);
  console.log("Has YEAR_END_REPORTING_AS:", moduleNames2.includes("YEAR_END_REPORTING_AS"));

  // 4. Check company modules after activation
  console.log("\n========== COMPANY MODULES AFTER ACTIVATION ==========");
  await api("GET", "/company/modules?fields=*");

  // 5. Check yearEnd state after activation
  console.log("\n========== YEAR-END STATE AFTER ACTIVATION ==========");
  const ye = await api("GET", "/yearEnd?year=2025&fields=*");

  // 6. Look at yearEndReportPosting specifically
  console.log("\n========== yearEndReportPosting details ==========");
  const yrp = ye.data?.value?.yearEndReportPosting;
  console.log("yearEndReportPosting:", JSON.stringify(yrp, null, 2));

  // 7. Check if there's a yearEnd/note or yearEnd/report or yearEnd/accounts endpoint
  console.log("\n========== EXPLORE yearEnd RELATED ENDPOINTS ==========");
  for (const ep of [
    "/yearEnd/report?year=2025",
    "/yearEnd/note?year=2025",
    "/yearEnd/accounts?year=2025",
    "/yearEnd?year=2025&fields=*,yearEndReportPosting(*)",
  ]) {
    await api("GET", ep);
  }

  // 8. Check the taxCost grouping — which accounts feed into it?
  console.log("\n========== TAX COST ANALYSIS ==========");
  const taxCost = ye.data?.value?.taxCost;
  console.log("taxCost.sumAmount:", taxCost?.sumAmount);
  if (taxCost?.posts) {
    for (const p of taxCost.posts) {
      console.log(`  groupNumber: ${p.groupNumber}, grouping: ${p.grouping}, sumAmount: ${p.sumAmount}`);
    }
  }

  // 9. Check what's on account 8300 vs 8700 in the balance sheet
  console.log("\n========== 8300 vs 8700 BALANCE ==========");
  await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8300&accountNumberTo=8700&fields=*,account(number,name)&count=50");

  // 10. Count how many year-end vouchers exist (for reset)
  console.log("\n========== YEAR-END VOUCHER COUNT ==========");
  const vouchers = await api("GET", "/ledger/voucher?dateFrom=2025-12-31&dateTo=2026-01-01&fields=id,number,date,description&count=1");
  console.log("Total year-end vouchers:", vouchers.data?.fullResultSize);

  // 11. Count all 2025 vouchers
  const allVouchers = await api("GET", "/ledger/voucher?dateFrom=2025-01-01&dateTo=2026-01-01&fields=id&count=1");
  console.log("Total 2025 vouchers:", allVouchers.data?.fullResultSize);

  // 12. Can we DELETE vouchers? Check if DELETE is allowed
  console.log("\n========== TEST VOUCHER DELETE ==========");
  // Don't actually delete yet, just test with a small one
  // await api("DELETE", "/ledger/voucher/609435102"); // disposition voucher
}

main().catch(console.error);
