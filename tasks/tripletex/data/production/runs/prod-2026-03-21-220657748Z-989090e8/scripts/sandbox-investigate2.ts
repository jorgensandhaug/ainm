// Sandbox investigation: test the full payroll flow and inspect resulting state
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const YEAR = 2026; const MONTH = 3; const DATE = "2026-03-21"; const MONTH_START = "2026-03-01";
const BASE_SALARY = 36800; const BONUS_AMOUNT = 14100; const GROSS = BASE_SALARY + BONUS_AMOUNT;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (r.status >= 400) console.log("ERROR:", JSON.stringify(json, null, 2));
  return { status: r.status, data: json };
}

async function main() {
  // Get department for sandbox
  const deptRes = await api("GET", "/department?count=1&fields=*");
  const deptId = deptRes.data.values?.[0]?.id;
  console.log(`Department: id=${deptId}`);

  // Create disposable employee (sandbox requires department)
  const testEmail = `payroll-test-${Date.now()}@example.org`;
  const empCreateRes = await api("POST", "/employee", {
    firstName: "TestPayroll",
    lastName: `Sandbox${Date.now()}`,
    email: testEmail,
    userType: "NO_ACCESS",
    department: { id: deptId },
  });
  if (empCreateRes.status !== 201) { console.log("Cannot create test employee"); return; }
  const empId = empCreateRes.data.value.id;
  console.log(`Created test employee: id=${empId}`);

  // Get existing division
  const divRes = await api("GET", "/division?count=1&fields=*");
  const divisionId = divRes.data.values?.[0]?.id;
  console.log(`Division: id=${divisionId}`);

  // Repair employee (set dateOfBirth)
  await api("PUT", `/employee/${empId}`, { ...empCreateRes.data.value, dateOfBirth: "1990-01-01" });

  // Create employment
  const emplRes = await api("POST", "/employee/employment", {
    employee: { id: empId },
    division: { id: divisionId },
    startDate: MONTH_START,
    isMainEmployer: true,
    taxDeductionCode: "loennFraHovedarbeidsgiver",
  });
  const employmentId = emplRes.data.value?.id;
  console.log(`Employment: id=${employmentId}`);

  // Create employment details
  const detailsRes = await api("POST", "/employee/employment/details", {
    employment: { id: employmentId },
    date: MONTH_START,
    employmentType: "ORDINARY",
    employmentForm: "PERMANENT",
    remunerationType: "MONTHLY_WAGE",
    workingHoursScheme: "NOT_SHIFT",
    percentageOfFullTimeEquivalent: 100,
    monthlySalary: BASE_SALARY,
    annualSalary: BASE_SALARY * 12,
  });
  console.log(`Employment details: ${detailsRes.status}`);

  // Resolve salary types
  const salTypeRes = await api("GET", "/salary/type?count=1000&fields=*");
  const salTypes = salTypeRes.data.values || [];
  const fastlonn = salTypes.find((t: any) => t.name === "Fastlønn");
  const bonus = salTypes.find((t: any) => t.name === "Bonus");
  console.log(`Fastlønn id=${fastlonn?.id}, Bonus id=${bonus?.id}`);

  // Create salary transaction WITH generateTaxDeduction=true
  const txRes = await api("POST", "/salary/transaction?generateTaxDeduction=true", {
    date: DATE, year: YEAR, month: MONTH, paySlipsAvailableDate: DATE,
    payslips: [{
      employee: { id: empId }, date: DATE, year: YEAR, month: MONTH,
      specifications: [
        { employee: { id: empId }, salaryType: { id: fastlonn.id }, description: `Fastlønn mars ${YEAR}`, year: YEAR, month: MONTH, count: 1, rate: BASE_SALARY, amount: BASE_SALARY },
        { employee: { id: empId }, salaryType: { id: bonus.id }, description: `Bonus mars ${YEAR}`, year: YEAR, month: MONTH, count: 1, rate: BONUS_AMOUNT, amount: BONUS_AMOUNT },
      ],
    }],
  });
  const txId = txRes.data.value?.id;
  const payslipId = txRes.data.value?.payslips?.[0]?.id;
  console.log(`Transaction id=${txId}, payslip id=${payslipId}`);

  // ====== INSPECT PAYSLIP STATE BEFORE VOUCHER ======
  console.log("\n=== PAYSLIP BEFORE VOUCHER ===");
  const psBefore = await api("GET", `/salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`);
  const psB = psBefore.data.value;
  console.log(`grossAmount=${psB?.grossAmount}, amount=${psB?.amount}, number=${psB?.number}`);
  console.log(`specifications (${psB?.specifications?.length}):`);
  psB?.specifications?.forEach((s: any) => {
    console.log(`  ${s.salaryType?.name} (type ${s.salaryType?.number}): amount=${s.amount}, rate=${s.rate}`);
  });

  // Check if there are ledger postings for this payslip BEFORE voucher
  const postingsBefore = await api("GET", `/ledger/posting?employeeId=${empId}&dateFrom=${DATE}&dateTo=${DATE}&count=100&fields=*`);
  console.log(`\nLedger postings for employee before voucher: ${postingsBefore.data.values?.length || 0}`);

  // ====== CREATE VOUCHER ======
  const [vtRes, accRes] = await Promise.all([
    api("GET", "/ledger/voucherType?name=L%C3%B8nnsbilag&count=1&fields=*"),
    api("GET", "/ledger/account?number=5000,1920&count=10&fields=*"),
  ]);
  const voucherTypeId = vtRes.data.values?.[0]?.id;
  const acc5000 = accRes.data.values?.find((a: any) => a.number === 5000);
  const acc1920 = accRes.data.values?.find((a: any) => a.number === 1920);

  const voucherRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
    voucherType: { id: voucherTypeId },
    date: DATE,
    description: `Lønn mars ${YEAR} - Fastlønn ${BASE_SALARY} + Bonus ${BONUS_AMOUNT}`,
    postings: [
      { account: { id: acc5000.id }, amount: BASE_SALARY, description: `Fastlønn mars ${YEAR}`, row: 1 },
      { account: { id: acc5000.id }, amount: BONUS_AMOUNT, description: `Bonus mars ${YEAR}`, row: 2 },
      { account: { id: acc1920.id }, amount: -GROSS, description: `Lønn mars ${YEAR}`, row: 3 },
    ],
  });
  console.log(`Voucher: ${voucherRes.status}, id=${voucherRes.data.value?.id}, number=${voucherRes.data.value?.number}`);

  // ====== INSPECT PAYSLIP STATE AFTER VOUCHER ======
  console.log("\n=== PAYSLIP AFTER VOUCHER ===");
  const psAfter = await api("GET", `/salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`);
  const psA = psAfter.data.value;
  console.log(`grossAmount=${psA?.grossAmount}, amount=${psA?.amount}, number=${psA?.number}`);
  console.log(`specifications (${psA?.specifications?.length}):`);
  psA?.specifications?.forEach((s: any) => {
    console.log(`  ${s.salaryType?.name} (type ${s.salaryType?.number}): amount=${s.amount}, rate=${s.rate}`);
  });

  // Check if there are ledger postings for this employee AFTER voucher
  const postingsAfter = await api("GET", `/ledger/posting?employeeId=${empId}&dateFrom=${DATE}&dateTo=${DATE}&count=100&fields=*`);
  console.log(`\nLedger postings for employee after voucher: ${postingsAfter.data.values?.length || 0}`);

  // Also inspect the salary transaction state
  const txAfter = await api("GET", `/salary/transaction/${txId}?fields=*`);
  console.log("\n=== SALARY TRANSACTION ===");
  const txD = txAfter.data.value;
  console.log(`id=${txD?.id}, date=${txD?.date}, year=${txD?.year}, month=${txD?.month}`);
  console.log(`payslips: ${txD?.payslips?.length}`);

  // Check employment details
  const emplDetails = await api("GET", `/employee/employment/details?employmentId=${employmentId}&fields=*`);
  console.log("\n=== EMPLOYMENT DETAILS ===");
  emplDetails.data.values?.forEach((d: any) => {
    console.log(`  remunerationType=${d.remunerationType}, monthlySalary=${d.monthlySalary}, annualSalary=${d.annualSalary}`);
    console.log(`  employmentType=${d.employmentType}, employmentForm=${d.employmentForm}`);
    console.log(`  percentageOfFullTimeEquivalent=${d.percentageOfFullTimeEquivalent}`);
  });

  console.log("\n=== INVESTIGATION COMPLETE ===");
}

main().catch(e => console.error(e));
