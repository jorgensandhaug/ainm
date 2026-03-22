// 205: Full yearEnd + balanceSheet dump to understand tax account mapping
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + Buffer.from(`0:${TOKEN}`).toString("base64");

const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}${path}`;
  console.log(`\n========== GET ${path} ==========`);
  const r = await fetch(url, { headers: h });
  console.log(`Status: ${r.status}`);
  const body = await r.json();
  console.log(JSON.stringify(body, null, 2));
  return body;
}

async function main() {
  // 1. Full yearEnd response
  console.log("\n\n######## YEAR END (year=2025, fields=*) ########");
  await get("/yearEnd?year=2025&fields=*");

  // 2. Also try with all sub-fields
  console.log("\n\n######## YEAR END (year=2025, fields=*,taxCost(*),annualResult(*),yearEndReportPosting(*),transfers(*)) ########");
  await get("/yearEnd?year=2025&fields=*,taxCost(*),annualResult(*),yearEndReportPosting(*),transfers(*),netProfitOrLossForTheYear(*),operatingExpense(*),fixedAsset(*)");

  // 3. Balance sheet 8000-8999
  console.log("\n\n######## BALANCE SHEET 8000-8999 ########");
  await get("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8000&accountNumberTo=8999&fields=*");

  // 4. Balance sheet 2000-2999
  console.log("\n\n######## BALANCE SHEET 2000-2999 ########");
  await get("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=2000&accountNumberTo=2999&fields=*");

  // 5. Also check ledger postings on 8xxx accounts
  console.log("\n\n######## LEDGER (8000-8999) ########");
  await get("/ledger?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8000&accountNumberTo=8999&fields=*&count=100");

  // 6. Check what vouchers exist for year-end
  console.log("\n\n######## VOUCHERS (year-end type search) ########");
  await get("/ledger/voucher?dateFrom=2025-01-01&dateTo=2025-12-31&count=50&fields=*");

  // 7. Check year-end report postings endpoint if it exists
  console.log("\n\n######## YEAR END REPORT POSTING ########");
  await get("/yearEnd/reportPosting?year=2025&fields=*");

  // 8. Check specific account balances for tax-relevant accounts
  console.log("\n\n######## BALANCE SHEET 8300 specifically ########");
  await get("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8300&accountNumberTo=8300&fields=*");

  console.log("\n\n######## BALANCE SHEET 8700 specifically ########");
  await get("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8700&accountNumberTo=8700&fields=*");

  console.log("\n\n######## BALANCE SHEET 2500 specifically ########");
  await get("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=2500&accountNumberTo=2500&fields=*");

  console.log("\n\n######## BALANCE SHEET 2920 specifically ########");
  await get("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=2920&accountNumberTo=2920&fields=*");

  // 9. Also check 8800 and 2050 (disposition accounts)
  console.log("\n\n######## BALANCE SHEET 8800 (disposition) ########");
  await get("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8800&accountNumberTo=8800&fields=*");

  console.log("\n\n######## BALANCE SHEET 2050 (disposition) ########");
  await get("/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=2050&accountNumberTo=2050&fields=*");
}

main().catch(e => { console.error(e); process.exit(1); });
