// TEST: Does generateTaxDeduction=true change payslip output?
// Also test salary/compilation endpoint
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 600));
  return { status: res.status, data: json };
}

async function main() {
  const empId = 18592549;
  const SALARY = 41750;
  const BONUS = 6750;

  // Get salary types
  const stRes = await api("GET", "/salary/type?count=1000&fields=*");
  const fastlonn = stRes.data?.values?.find((t: any) => t.name === "Fastlønn");
  const bonus = stRes.data?.values?.find((t: any) => t.name === "Bonus");

  // ====================================================
  // TEST 1: Create salary transaction WITH generateTaxDeduction=true
  // ====================================================
  console.log("\n=== TEST 1: With generateTaxDeduction=true (month 6) ===\n");
  const txRes = await api("POST", "/salary/transaction?generateTaxDeduction=true", {
    date: "2026-03-21",
    year: 2026,
    month: 6,
    paySlipsAvailableDate: "2026-03-21",
    payslips: [{
      employee: { id: empId },
      specifications: [
        { employee: { id: empId }, salaryType: { id: fastlonn?.id }, description: "Fastlønn", year: 2026, month: 6, count: 1, rate: SALARY, amount: SALARY },
        { employee: { id: empId }, salaryType: { id: bonus?.id }, description: "Bonus", year: 2026, month: 6, count: 1, rate: BONUS, amount: BONUS },
      ],
    }],
  });

  const txId = txRes.data?.value?.id;
  const psStubs = txRes.data?.value?.payslips || [];
  console.log("Transaction:", JSON.stringify(txRes.data?.value, null, 2));

  if (!txId) {
    console.log("FAILED to create transaction");
    return;
  }

  // Read the payslip with full expansion
  for (const ps of psStubs) {
    const psRes = await api("GET", `/salary/payslip/${ps.id}?fields=*,specifications(*,salaryType(*))`);
    const p = psRes.data?.value;
    console.log(`\nPayslip ${ps.id}:`);
    console.log(`  grossAmount=${p?.grossAmount} netAmount=${p?.netAmount} amount=${p?.amount}`);
    console.log(`  number=${p?.number} year=${p?.year} month=${p?.month}`);
    console.log(`  vacationAllowanceAmount=${p?.vacationAllowanceAmount}`);
    console.log(`  specifications: ${p?.specifications?.length}`);
    for (const s of (p?.specifications || [])) {
      console.log(`    ${s.salaryType?.name}(${s.salaryType?.number}): amount=${s.amount} count=${s.count} rate=${s.rate}`);
    }
    // Check ALL fields for any new ones
    const allKeys = Object.keys(p || {});
    console.log(`  ALL KEYS: ${allKeys.join(", ")}`);
  }

  // ====================================================
  // TEST 2: Check salary compilation for this employee
  // ====================================================
  console.log("\n=== TEST 2: Salary compilation ===\n");
  const compRes = await api("GET", `/salary/compilation?employeeId=${empId}&year=2026&fields=*`);
  console.log("Compilation:", JSON.stringify(compRes.data?.value, null, 2)?.slice(0, 2000));

  // ====================================================
  // TEST 3: Check salary settings
  // ====================================================
  console.log("\n=== TEST 3: Salary settings ===\n");
  const settRes = await api("GET", "/salary/settings?fields=*");
  console.log("Settings:", JSON.stringify(settRes.data?.value, null, 2)?.slice(0, 1500));

  // ====================================================
  // TEST 4: Check for ledger vouchers from salary
  // ====================================================
  console.log("\n=== TEST 4: Salary vouchers after generateTaxDeduction ===\n");
  const vRes = await api("GET", `/ledger/voucher?dateFrom=2026-03-21&dateTo=2026-03-22&count=50&fields=*&sorting=id&order=desc`);
  // Filter for salary-related (voucherType with "Lønn" or "lønns")
  for (const v of (vRes.data?.values || []).slice(0, 10)) {
    console.log(`  voucher id=${v.id} number=${v.number} type=${v.voucherType?.id} typeName="${v.voucherType?.name}" desc="${v.description}"`);
  }

  // ====================================================
  // TEST 5: Check if payslip search works after generateTaxDeduction
  // ====================================================
  console.log("\n=== TEST 5: Payslip search ===\n");
  const psSearch = await api("GET", `/salary/payslip?employeeId=${empId}&count=100&fields=*`);
  console.log(`Payslips for employee: ${psSearch.data?.fullResultSize}`);
  for (const ps of (psSearch.data?.values || [])) {
    console.log(`  id=${ps.id} year=${ps.year} month=${ps.month} grossAmount=${ps.grossAmount} netAmount=${ps.netAmount} number=${ps.number}`);
  }

  // Also try: payslip by yearFrom/yearTo
  const psSearch2 = await api("GET", `/salary/payslip?yearFrom=2026&yearTo=2026&count=100&fields=*`);
  console.log(`\nPayslips by year: ${psSearch2.data?.fullResultSize}`);
  for (const ps of (psSearch2.data?.values || [])) {
    console.log(`  id=${ps.id} emp=${ps.employee?.id} year=${ps.year} month=${ps.month} grossAmount=${ps.grossAmount}`);
  }

  // Clean up
  console.log("\n=== Cleanup ===\n");
  await api("DELETE", `/salary/transaction/${txId}`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
