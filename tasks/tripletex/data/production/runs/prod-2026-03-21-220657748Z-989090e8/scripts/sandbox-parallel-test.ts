// Test: Can we parallelize employee repair with salary/type + voucherType + accounts reads?
// This tests whether the 3 reads depend on employee state at all.
// If they don't, we can run them concurrently with PUT employee + POST employment + POST employment/details
// This doesn't reduce call count but reduces wall-clock time significantly.

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
  // Setup (sandbox-specific)
  const deptRes = await api("GET", "/department?count=1&fields=*");
  const deptId = deptRes.data.values?.[0]?.id;

  const testEmail = `payroll-parallel-${Date.now()}@example.org`;
  const empCreateRes = await api("POST", "/employee", {
    firstName: "TestParallel",
    lastName: `P${Date.now()}`,
    email: testEmail,
    userType: "NO_ACCESS",
    department: { id: deptId },
  });
  const empId = empCreateRes.data.value.id;
  const divRes = await api("GET", "/division?count=1&fields=*");
  const divisionId = divRes.data.values?.[0]?.id;

  console.log("\n=== PARALLEL TEST: repair chain + reads concurrently ===");
  const start = Date.now();

  // Run employee repair chain AND 3 reads in parallel
  const [putResult, emplResult, salTypeRes, vtRes, accRes] = await Promise.all([
    // Repair chain (sequential within this promise)
    (async () => {
      const put = await api("PUT", `/employee/${empId}`, { ...empCreateRes.data.value, dateOfBirth: "1990-01-01" });
      return put;
    })(),
    // Employment creation (needs PUT to complete first, so sequential)
    (async () => {
      // Wait for PUT to finish
      await api("PUT", `/employee/${empId}`, { ...empCreateRes.data.value, dateOfBirth: "1990-01-01" });
      const empl = await api("POST", "/employee/employment", {
        employee: { id: empId },
        division: { id: divisionId },
        startDate: MONTH_START,
        isMainEmployer: true,
        taxDeductionCode: "loennFraHovedarbeidsgiver",
      });
      return empl;
    })(),
    // Independent reads
    api("GET", "/salary/type?count=1000&fields=*"),
    api("GET", "/ledger/voucherType?name=L%C3%B8nnsbilag&count=1&fields=*"),
    api("GET", "/ledger/account?number=5000,1920&count=10&fields=*"),
  ]);

  console.log(`Parallel phase took ${Date.now() - start}ms`);

  // Sequential: employment details (needs employment ID)
  const employmentId = emplResult.data.value?.id;
  await api("POST", "/employee/employment/details", {
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

  // Resolve salary types
  const salTypes = salTypeRes.data.values || [];
  const fastlonn = salTypes.find((t: any) => t.name === "Fastlønn");
  const bonus = salTypes.find((t: any) => t.name === "Bonus");

  // Create salary transaction
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
  console.log(`\nTransaction: ${txRes.status}, id=${txRes.data.value?.id}`);

  // Verify payslip
  const payslipId = txRes.data.value?.payslips?.[0]?.id;
  const psRes = await api("GET", `/salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`);
  const ps = psRes.data.value;
  console.log(`\n=== PAYSLIP VERIFICATION ===`);
  console.log(`grossAmount=${ps?.grossAmount}, amount=${ps?.amount}`);
  ps?.specifications?.forEach((s: any) => {
    console.log(`  ${s.salaryType?.name}: amount=${s.amount}`);
  });

  console.log(`\nTotal wall-clock: ${Date.now() - start}ms`);
}

main().catch(e => console.error(e));
