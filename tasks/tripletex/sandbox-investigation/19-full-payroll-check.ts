// COMPREHENSIVE: Full payroll test checking ALL scorer-relevant state
// Using employee 18592549 which already has employment + employment details
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
  const YEAR = 2026;
  const MONTH = 7; // Use unused month
  const DATE = "2026-03-21";

  // ====================================================
  // PRE-CHECK: Verify employee state
  // ====================================================
  console.log("=== PRE-CHECK: Employee state ===\n");

  const empRes = await api("GET", `/employee/${empId}?fields=*`);
  const emp = empRes.data?.value;
  console.log(`Employee: ${emp?.firstName} ${emp?.lastName} dob=${emp?.dateOfBirth}`);

  const emplRes = await api("GET", `/employee/employment?employeeId=${empId}&count=10&fields=*`);
  const employments = emplRes.data?.values || [];
  console.log(`Employments: ${employments.length}`);
  for (const empl of employments) {
    console.log(`  empl.id=${empl.id} startDate=${empl.startDate} division=${empl.division?.id}`);

    const detRes = await api("GET", `/employee/employment/details?employmentId=${empl.id}&fields=*`);
    const dets = detRes.data?.values || [];
    console.log(`  details: ${dets.length}`);
    for (const d of dets) {
      console.log(`    id=${d.id} monthlySalary=${d.monthlySalary} annualSalary=${d.annualSalary} remunerationType=${d.remunerationType}`);
      console.log(`    employmentType=${d.employmentType} employmentForm=${d.employmentForm} workingHoursScheme=${d.workingHoursScheme}`);
      console.log(`    percentageOfFullTimeEquivalent=${d.percentageOfFullTimeEquivalent}`);
    }
  }

  // ====================================================
  // STEP 1: Get salary types
  // ====================================================
  const stRes = await api("GET", "/salary/type?count=1000&fields=*");
  const fastlonn = stRes.data?.values?.find((t: any) => t.name === "Fastlønn");
  const bonus = stRes.data?.values?.find((t: any) => t.name === "Bonus");
  console.log(`\nFastlønn: id=${fastlonn?.id} number=${fastlonn?.number}`);
  console.log(`Bonus: id=${bonus?.id} number=${bonus?.number}`);

  // ====================================================
  // STEP 2: Create salary transaction WITH generateTaxDeduction=true
  // ====================================================
  console.log("\n=== CREATE: salary/transaction?generateTaxDeduction=true ===\n");
  const txRes = await api("POST", "/salary/transaction?generateTaxDeduction=true", {
    date: DATE,
    year: YEAR,
    month: MONTH,
    paySlipsAvailableDate: DATE,
    payslips: [{
      employee: { id: empId },
      date: DATE,
      year: YEAR,
      month: MONTH,
      specifications: [
        { employee: { id: empId }, salaryType: { id: fastlonn?.id }, description: "Fastlønn", year: YEAR, month: MONTH, count: 1, rate: SALARY, amount: SALARY },
        { employee: { id: empId }, salaryType: { id: bonus?.id }, description: "Bonus", year: YEAR, month: MONTH, count: 1, rate: BONUS, amount: BONUS },
      ],
    }],
  });

  const txId = txRes.data?.value?.id;
  const payslipId = txRes.data?.value?.payslips?.[0]?.id;
  console.log(`Transaction: id=${txId}, Payslip: id=${payslipId}`);

  if (!txId) {
    console.log("FAILED to create transaction");
    return;
  }

  // ====================================================
  // CHECK 1: Read payslip in detail
  // ====================================================
  console.log("\n=== CHECK 1: Payslip detail ===\n");
  const psRes = await api("GET", `/salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`);
  const ps = psRes.data?.value;
  console.log(`  grossAmount=${ps?.grossAmount} netAmount=${ps?.netAmount} amount=${ps?.amount}`);
  console.log(`  number=${ps?.number} year=${ps?.year} month=${ps?.month} date=${ps?.date}`);
  console.log(`  vacationAllowanceAmount=${ps?.vacationAllowanceAmount}`);
  console.log(`  department=${ps?.department?.id}`);
  console.log(`  specifications: ${ps?.specifications?.length}`);
  for (const s of (ps?.specifications || [])) {
    console.log(`    ${s.salaryType?.name}(${s.salaryType?.number}): amount=${s.amount} count=${s.count} rate=${s.rate}`);
  }

  // ====================================================
  // CHECK 2: Payslip search by employee
  // ====================================================
  console.log("\n=== CHECK 2: Payslip search ===\n");
  const psSearch = await api("GET", `/salary/payslip?employeeId=${empId}&yearFrom=${YEAR}&monthFrom=${MONTH}&yearTo=${YEAR}&monthTo=${MONTH + 1}&count=100&fields=*`);
  console.log(`Payslip search: ${psSearch.data?.fullResultSize} results`);
  for (const p of (psSearch.data?.values || [])) {
    console.log(`  id=${p.id} grossAmount=${p.grossAmount} amount=${p.amount} number=${p.number}`);
  }

  // ====================================================
  // CHECK 3: Wage postings in ledger
  // ====================================================
  console.log("\n=== CHECK 3: Wage postings ===\n");
  const postRes = await api("GET", `/ledger/posting?employeeId=${empId}&dateFrom=${DATE}&dateTo=2026-03-22&type=WAGE&count=100&fields=*`);
  console.log(`Wage postings: ${postRes.data?.fullResultSize}`);
  for (const p of (postRes.data?.values || [])) {
    console.log(`  id=${p.id} acct=${p.account?.number} amount=${p.amount} desc="${p.description}" row=${p.row}`);
  }

  // Also check ALL postings (not just WAGE type)
  const allPostRes = await api("GET", `/ledger/posting?employeeId=${empId}&dateFrom=${DATE}&dateTo=2026-03-22&count=100&fields=*`);
  console.log(`\nAll postings for employee: ${allPostRes.data?.fullResultSize}`);
  for (const p of (allPostRes.data?.values || [])) {
    console.log(`  id=${p.id} acct=${p.account?.number} amount=${p.amount} desc="${p.description}" type=${p.type}`);
  }

  // ====================================================
  // CHECK 4: Salary compilation
  // ====================================================
  console.log("\n=== CHECK 4: Salary compilation ===\n");
  const compRes = await api("GET", `/salary/compilation?employeeId=${empId}&year=${YEAR}&fields=*`);
  const comp = compRes.data?.value;
  console.log(`  vacationPayBasis=${comp?.vacationPayBasis}`);
  console.log(`  wages: ${comp?.wages?.length}`);
  for (const w of (comp?.wages || [])) {
    console.log(`    month=${w.month} salaryType=${w.salaryType?.id} amount=${w.amount}`);
  }
  console.log(`  taxDeductions: ${comp?.taxDeductions?.length}`);
  for (const td of (comp?.taxDeductions || [])) {
    console.log(`    month=${td.month} amount=${td.amount}`);
  }

  // ====================================================
  // CHECK 5: Salary voucher
  // ====================================================
  console.log("\n=== CHECK 5: Salary vouchers ===\n");
  const vouchRes = await api("GET", `/ledger/voucher?dateFrom=${DATE}&dateTo=2026-03-22&count=50&fields=*&sorting=id&order=desc`);
  const allVouchers = vouchRes.data?.values || [];
  // Filter for salary type (Lønnsbilag = 9744848)
  const salaryVouchers = allVouchers.filter((v: any) => v.voucherType?.id === 9744848);
  console.log(`Salary vouchers (type 9744848): ${salaryVouchers.length}`);
  if (salaryVouchers.length > 0) {
    for (const v of salaryVouchers) {
      console.log(`  id=${v.id} number=${v.number} desc="${v.description}"`);
    }
  }

  // Also show any voucher types that mention salary/lønn
  console.log(`\nAll voucher types today:`);
  const types = new Set<string>();
  for (const v of allVouchers) {
    types.add(`${v.voucherType?.id}: desc="${v.description?.slice(0,50)}"`);
  }
  for (const t of types) console.log(`  ${t}`);

  // ====================================================
  // CHECK 6: Employment state after transaction
  // ====================================================
  console.log("\n=== CHECK 6: Employment after transaction ===\n");
  const emplAfter = await api("GET", `/employee/employment?employeeId=${empId}&count=10&fields=*`);
  for (const empl of (emplAfter.data?.values || [])) {
    console.log(`  empl.id=${empl.id} latestSalary=${empl.latestSalary?.id}`);
  }

  // ====================================================
  // CHECK 7: Employee compilation PDF
  // ====================================================
  console.log("\n=== CHECK 7: Payslip PDF ===\n");
  const pdfUrl = `${BASE}/salary/payslip/${payslipId}/pdf`;
  const pdfRes = await fetch(pdfUrl, { headers: { Authorization: AUTH, Accept: "application/octet-stream" } });
  console.log(`Payslip PDF: status=${pdfRes.status} contentType=${pdfRes.headers.get("content-type")}`);
  if (pdfRes.ok) {
    const bytes = (await pdfRes.arrayBuffer()).byteLength;
    console.log(`  PDF size: ${bytes} bytes`);
  } else {
    const errText = await pdfRes.text();
    console.log(`  PDF error: ${errText.slice(0, 300)}`);
  }

  // DO NOT delete — keep for inspection
  console.log(`\n=== SUMMARY ===`);
  console.log(`Transaction ID: ${txId}`);
  console.log(`Payslip ID: ${payslipId}`);
  console.log(`grossAmount: ${ps?.grossAmount}`);
  console.log(`amount (after tax): ${ps?.amount}`);
  console.log(`specifications: ${ps?.specifications?.length}`);
  console.log(`Payslip search returns: ${psSearch.data?.fullResultSize}`);
  console.log(`Wage postings: ${postRes.data?.fullResultSize}`);
  console.log(`Salary vouchers: ${salaryVouchers.length}`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
