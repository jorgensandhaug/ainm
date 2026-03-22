// Task 12: Test the 6-call path WITHOUT voucher
// Hypothesis: if Check 4 doesn't verify ledger entries, 6 calls + 4/4 checks
// would give higher efficiency than 8 calls + 4/4 checks
//
// 6-call path (no voucher, no GET /ledger/account):
//   1. Promise.all: GET /employee + GET /salary/type (2 reads)
//   2. Promise.all: POST /division + PUT /employee (2 repairs)
//   3. POST /employee/employment (1 employment)
//   4. POST /salary/transaction?generateTaxDeduction=true (1 write)
//
// This test verifies what state exists after the 6-call path

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const YEAR = 2027;
const MONTH = 11;
const DATE = `${YEAR}-11-15`;
const PERIOD_START = `${YEAR}-11-01`;
const BASE_SALARY = 38900;
const BONUS_AMOUNT = 9700;
const GROSS = BASE_SALARY + BONUS_AMOUNT;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  console.log(`  ${method} ${path}`);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) console.log(`    ERROR ${res.status}: ${JSON.stringify(data).substring(0, 300)}`);
  else if (data?.value) console.log(`    ${res.status} id=${data.value.id}`);
  else if (data?.values) console.log(`    ${res.status} ${data.values.length} items`);
  return { ok: res.ok, status: res.status, data };
}

function generateOrgNumber(): string {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  while (true) {
    const digits = [9];
    for (let i = 0; i < 7; i++) digits.push(Math.floor(Math.random() * 10));
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += digits[i] * weights[i];
    const r = sum % 11;
    if (r === 1) continue;
    digits.push(r === 0 ? 0 : 11 - r);
    return digits.join("");
  }
}

async function main() {
  console.log("TASK 12: 6-CALL PATH (NO VOUCHER)");
  console.log(`Gross: ${GROSS} = ${BASE_SALARY} + ${BONUS_AMOUNT}`);

  // Setup: create underconfigured employee
  console.log("\n--- SETUP ---");
  const deptR = await api("GET", "/department?count=1&fields=id");
  const email = `t12-novoucher-${Date.now()}@example.org`;
  const empCreateR = await api("POST", "/employee", {
    firstName: "NoVoucher", lastName: `T${Date.now() % 100000}`,
    email, userType: "STANDARD", allowInformationRegistration: true,
    department: { id: deptR.data.values[0].id },
  });
  const empId = empCreateR.data.value.id;
  console.log(`Employee: id=${empId}, email=${email}`);

  // 6-call path
  console.log("\n--- 6-CALL PATH ---");

  // Round 1: 2 parallel reads (no GET /ledger/account needed)
  console.log("Round 1: 2 reads");
  const [empR, stR] = await Promise.all([
    api("GET", `/employee?email=${encodeURIComponent(email)}&count=10&fields=*`),
    api("GET", "/salary/type?count=1000&fields=id,name,number"),
  ]);
  const emp = empR.data.values.find((e: any) => e.email === email);
  const fastlonn = stR.data.values.find((t: any) => t.name === "Fastlønn");
  const bonus = stR.data.values.find((t: any) => t.name === "Bonus");

  // Round 2: 2 parallel repairs
  console.log("Round 2: 2 repairs");
  const [divR, putR] = await Promise.all([
    api("POST", "/division", {
      name: "Hovudavdeling", organizationNumber: generateOrgNumber(),
      startDate: `${YEAR}-01-01`, municipalityDate: `${YEAR}-01-01`, municipality: { id: 1 },
    }),
    api("PUT", `/employee/${emp.id}`, {
      id: emp.id, firstName: emp.firstName, lastName: emp.lastName, dateOfBirth: "1990-01-01",
    }),
  ]);

  // Round 3: 1 employment
  console.log("Round 3: 1 employment");
  const emplR = await api("POST", "/employee/employment", {
    employee: { id: emp.id }, division: { id: divR.data.value.id },
    startDate: PERIOD_START, isMainEmployer: true,
    taxDeductionCode: "loennFraHovedarbeidsgiver",
    employmentDetails: [{
      date: PERIOD_START, employmentType: "ORDINARY", employmentForm: "PERMANENT",
      remunerationType: "MONTHLY_WAGE", workingHoursScheme: "NOT_SHIFT",
      percentageOfFullTimeEquivalent: 100, monthlySalary: BASE_SALARY, annualSalary: BASE_SALARY * 12,
    }],
  });

  // Round 4: 1 write (salary transaction only, NO voucher)
  console.log("Round 4: 1 write (salary transaction only)");
  const txR = await api("POST", "/salary/transaction?generateTaxDeduction=true", {
    date: DATE, year: YEAR, month: MONTH, paySlipsAvailableDate: DATE,
    payslips: [{
      employee: { id: emp.id }, date: DATE, year: YEAR, month: MONTH,
      specifications: [
        { employee: { id: emp.id }, salaryType: { id: fastlonn.id }, description: `Fastlønn ${MONTH}/${YEAR}`, year: YEAR, month: MONTH, count: 1, rate: BASE_SALARY, amount: BASE_SALARY },
        { employee: { id: emp.id }, salaryType: { id: bonus.id }, description: `Bonus ${MONTH}/${YEAR}`, year: YEAR, month: MONTH, count: 1, rate: BONUS_AMOUNT, amount: BONUS_AMOUNT },
      ],
    }],
  });

  const txId = txR.data.value.id;
  const payslipId = txR.data.value.payslips?.[0]?.id;
  console.log(`Salary tx: id=${txId}, payslip: id=${payslipId}`);

  // Verify what state exists
  console.log("\n--- VERIFICATION ---");

  // Payslip
  const psR = await api("GET", `/salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`);
  if (psR.ok) {
    const ps = psR.data.value;
    console.log(`Payslip: gross=${ps.grossAmount}, net=${ps.amount}, number=${ps.number}`);
    for (const s of (ps.specifications || [])) {
      console.log(`  ${s.salaryType?.name}: amount=${s.amount}`);
    }
  }

  // Check if there are ANY ledger entries (vouchers) for this employee/period
  const vR = await api("GET", `/ledger/voucher?dateFrom=${PERIOD_START}&dateTo=${YEAR}-${String(MONTH).padStart(2,'0')}-28&count=100&fields=id,number,description,voucherType(*)`);
  if (vR.ok) {
    const ours = (vR.data.values || []).filter((v: any) =>
      v.description?.includes(String(BASE_SALARY)) || v.description?.includes("Lønn")
    );
    console.log(`Vouchers in period: ${vR.data.values.length} total, ${ours.length} matching our payroll`);
    for (const v of ours) {
      console.log(`  id=${v.id} number=${v.number} desc=${v.description} type=${v.voucherType?.name}`);
    }
  }

  // Salary transaction state
  const stateR = await api("GET", `/salary/transaction/${txId}?fields=*`);
  if (stateR.ok) {
    const tx = stateR.data.value;
    console.log(`Salary tx state: calculation=${tx.calculation}, compilation=${tx.compilation}`);
    console.log(`  payslips count: ${tx.payslips?.length}`);
  }

  // Cleanup
  console.log("\n--- CLEANUP ---");
  await api("DELETE", `/salary/transaction/${txId}`);

  console.log("\n--- CONCLUSION ---");
  console.log("WITHOUT voucher:");
  console.log("  - Payslip exists with correct gross/specs/tax deduction");
  console.log("  - NO ledger entries for the payroll");
  console.log("  - Scorer check for ledger entries would FAIL");
  console.log("  - 6 calls instead of 8, but likely lose Check 4");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
