// Deep exploration of task 30 sandbox state: yearEnd API, modules, existing vouchers, balance sheet
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
  console.log(JSON.stringify(json, null, 2));
  return { status: res.status, data: json };
}

async function main() {
  console.log("========== 1. YEAR-END STATE (2025) ==========");
  await api("GET", "/yearEnd?year=2025&fields=*");

  console.log("\n========== 2. COMPANY MODULES ==========");
  await api("GET", "/company/modules?fields=*");

  console.log("\n========== 3. SALES MODULES LIST ==========");
  // Check what sales modules are available/active
  await api("GET", "/company/salesmodules?fields=*&count=100");

  console.log("\n========== 4. EXISTING VOUCHERS ON 2025-12-31 ==========");
  await api("GET", "/ledger/voucher?dateFrom=2025-12-31&dateTo=2026-01-01&fields=id,number,date,description,postings(row,account(number,name),amountGross)&count=100");

  console.log("\n========== 5. BALANCE SHEET 2025 (3000-8299) ==========");
  await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8299&fields=*,account(id,number,name)&count=500");

  console.log("\n========== 6. BALANCE SHEET 2025 (ALL) ==========");
  await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=1000&accountNumberTo=9999&fields=account(number,name),balanceIn,balanceOut&count=500");

  console.log("\n========== 7. VOUCHER TYPES (year-end related) ==========");
  await api("GET", "/ledger/voucherType?fields=id,name&count=100");

  console.log("\n========== 8. ACCOUNTS NEEDED ==========");
  await api("GET", "/ledger/account?number=1200,1209,1210,1230,1240,1250,1700,6010,6300,7500,8300,8700,2500,2920,8800,2050&fields=id,number,name&count=50");

  console.log("\n========== 9. YEAR-END 2025 - ALL FIELDS DEEP DIVE ==========");
  // Try to get yearEndReportPosting and other deep fields
  const ye = await api("GET", "/yearEnd?year=2025&fields=id,status,annualResult,taxCost(*),operatingExpense(*),yearEndReportPosting(*),dispositions(*)");

  console.log("\n========== 10. CHECK yearEnd/{id} IF WE HAVE AN ID ==========");
  if (ye.data?.value?.id) {
    await api("GET", `/yearEnd/${ye.data.value.id}?fields=*`);
  }

  console.log("\n========== 11. CHECK /company WITH RELEVANT FIELDS ==========");
  await api("GET", "/company?fields=id,name,organizationNumber,modules(*)");

  console.log("\n========== 12. TRY yearEnd REPORT ENDPOINTS ==========");
  await api("GET", "/yearEnd/report?year=2025&fields=*");

  console.log("\n========== 13. ALL VOUCHERS IN 2025 (for reset planning) ==========");
  await api("GET", "/ledger/voucher?dateFrom=2025-01-01&dateTo=2026-01-01&fields=id,number,date,description&count=200&sorting=-date");
}

main().catch(console.error);
