// Test: Can we inline employmentDetails in POST /employee/employment to save 1 call?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const YEAR = 2026; const MONTH = 3; const DATE = "2026-03-21"; const MONTH_START = "2026-03-01";
const BASE_SALARY = 36800; const BONUS_AMOUNT = 14100;

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
  // Setup
  const deptRes = await api("GET", "/department?count=1&fields=*");
  const deptId = deptRes.data.values?.[0]?.id;
  const divRes = await api("GET", "/division?count=1&fields=*");
  const divisionId = divRes.data.values?.[0]?.id;

  const testEmail = `payroll-inline-${Date.now()}@example.org`;
  const empCreateRes = await api("POST", "/employee", {
    firstName: "TestInline",
    lastName: `I${Date.now()}`,
    email: testEmail,
    userType: "NO_ACCESS",
    department: { id: deptId },
  });
  const empId = empCreateRes.data.value.id;
  console.log(`Employee: id=${empId}`);

  // Set dateOfBirth
  await api("PUT", `/employee/${empId}`, { ...empCreateRes.data.value, dateOfBirth: "1990-01-01" });

  // Test: POST /employee/employment with inline employmentDetails
  console.log("\n=== TEST: Inline employmentDetails in POST /employee/employment ===");
  const emplRes = await api("POST", "/employee/employment", {
    employee: { id: empId },
    division: { id: divisionId },
    startDate: MONTH_START,
    isMainEmployer: true,
    taxDeductionCode: "loennFraHovedarbeidsgiver",
    employmentDetails: [{
      date: MONTH_START,
      employmentType: "ORDINARY",
      employmentForm: "PERMANENT",
      remunerationType: "MONTHLY_WAGE",
      workingHoursScheme: "NOT_SHIFT",
      percentageOfFullTimeEquivalent: 100,
      monthlySalary: BASE_SALARY,
      annualSalary: BASE_SALARY * 12,
    }],
  });

  if (emplRes.status === 201) {
    const employmentId = emplRes.data.value?.id;
    console.log(`Employment created: id=${employmentId}`);

    // Verify employment details were saved
    const detailsRes = await api("GET", `/employee/employment/details?employmentId=${employmentId}&fields=*`);
    console.log("\n=== VERIFY INLINE DETAILS ===");
    detailsRes.data.values?.forEach((d: any) => {
      console.log(`  remunerationType=${d.remunerationType}, monthlySalary=${d.monthlySalary}, annualSalary=${d.annualSalary}`);
      console.log(`  employmentType=${d.employmentType}, employmentForm=${d.employmentForm}`);
      console.log(`  percentageOfFullTimeEquivalent=${d.percentageOfFullTimeEquivalent}`);
    });

    // Now test payroll with this employee
    const salTypeRes = await api("GET", "/salary/type?count=1000&fields=*");
    const salTypes = salTypeRes.data.values || [];
    const fastlonn = salTypes.find((t: any) => t.name === "Fastlønn");
    const bonus = salTypes.find((t: any) => t.name === "Bonus");

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
    console.log(`\nSalary transaction: ${txRes.status}`);

    if (txRes.status === 201) {
      const payslipId = txRes.data.value?.payslips?.[0]?.id;
      const psRes = await api("GET", `/salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`);
      const ps = psRes.data.value;
      console.log(`grossAmount=${ps?.grossAmount}, amount=${ps?.amount}`);
      ps?.specifications?.forEach((s: any) => {
        console.log(`  ${s.salaryType?.name}: amount=${s.amount}`);
      });
    }
  }
}

main().catch(e => console.error(e));
