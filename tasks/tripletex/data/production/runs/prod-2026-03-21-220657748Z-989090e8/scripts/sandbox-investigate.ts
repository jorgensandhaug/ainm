// Sandbox investigation: test the full payroll flow and inspect all resulting state
// Goal: verify what a scorer would check, and test if voucher is needed

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const YEAR = 2026;
const MONTH = 3;
const DATE = "2026-03-21";
const MONTH_START = "2026-03-01";
const BASE_SALARY = 36800;
const BONUS_AMOUNT = 14100;
const GROSS = BASE_SALARY + BONUS_AMOUNT;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`\n${method} ${path} → ${r.status}`);
  if (r.status >= 400) console.log("ERROR:", JSON.stringify(json, null, 2));
  return { status: r.status, data: json };
}

function generateOrgNumber(): string {
  const digits = [9];
  for (let i = 0; i < 7; i++) digits.push(Math.floor(Math.random() * 10));
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += digits[i] * weights[i];
  const rem = sum % 11;
  if (rem === 1) return generateOrgNumber();
  const check = rem === 0 ? 0 : 11 - rem;
  digits.push(check);
  return digits.join("");
}

async function main() {
  // Create a disposable employee for testing
  const testEmail = `payroll-test-${Date.now()}@example.org`;
  const empCreateRes = await api("POST", "/employee", {
    firstName: "TestPayroll",
    lastName: `Sandbox${Date.now()}`,
    email: testEmail,
    userType: "NO_ACCESS",
  });
  if (empCreateRes.status !== 201) { console.log("Cannot create test employee"); return; }
  const empId = empCreateRes.data.value.id;
  console.log(`Created test employee: id=${empId}, email=${testEmail}`);

  // Get existing division
  const divRes = await api("GET", "/division?count=1&fields=*");
  const divisions = divRes.data.values || [];
  let divisionId: number;
  if (divisions.length > 0) {
    divisionId = divisions[0].id;
    console.log(`Using existing division: id=${divisionId}`);
  } else {
    console.log("No division, creating...");
    const orgNum = generateOrgNumber();
    const divCreate = await api("POST", "/division", {
      name: "Hovudavdeling",
      organizationNumber: orgNum,
      startDate: `${YEAR}-01-01`,
      municipalityDate: `${YEAR}-01-01`,
      municipality: { id: 1 },
    });
    divisionId = divCreate.data.value.id;
    console.log(`Created division: id=${divisionId}`);
  }

  // Repair employee
  const putRes = await api("PUT", `/employee/${empId}`, {
    ...empCreateRes.data.value,
    dateOfBirth: "1990-01-01",
  });
  console.log(`PUT employee dateOfBirth: ${putRes.status}`);

  // Create employment
  const emplRes = await api("POST", "/employee/employment", {
    employee: { id: empId },
    division: { id: divisionId },
    startDate: MONTH_START,
    isMainEmployer: true,
    taxDeductionCode: "loennFraHovedarbeidsgiver",
  });
  const employmentId = emplRes.data.value?.id;
  console.log(`Created employment: id=${employmentId}`);

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

  // Get salary types
  const salTypeRes = await api("GET", "/salary/type?count=1000&fields=*");
  const salTypes = salTypeRes.data.values || [];
  const fastlonn = salTypes.find((t: any) => t.name === "Fastlønn" || t.number === 120);
  const bonus = salTypes.find((t: any) => t.name === "Bonus" || t.number === 300);
  console.log(`Salary types: Fastlønn id=${fastlonn?.id}, Bonus id=${bonus?.id}`);

  // Create salary transaction WITH generateTaxDeduction=true
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
        {
          employee: { id: empId },
          salaryType: { id: fastlonn.id },
          description: `Fastlønn mars ${YEAR}`,
          year: YEAR,
          month: MONTH,
          count: 1,
          rate: BASE_SALARY,
          amount: BASE_SALARY,
        },
        {
          employee: { id: empId },
          salaryType: { id: bonus.id },
          description: `Bonus mars ${YEAR}`,
          year: YEAR,
          month: MONTH,
          count: 1,
          rate: BONUS_AMOUNT,
          amount: BONUS_AMOUNT,
        },
      ],
    }],
  });
  console.log(`Salary transaction: ${txRes.status}`);
  const txId = txRes.data.value?.id;
  const payslipLink = txRes.data.value?.payslips?.[0];
  console.log(`Transaction id=${txId}, payslip link:`, JSON.stringify(payslipLink));

  // Inspect payslip state BEFORE voucher
  const payslipId = payslipLink?.id;
  if (payslipId) {
    const psRes = await api("GET", `/salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`);
    console.log("\n=== PAYSLIP BEFORE VOUCHER ===");
    const ps = psRes.data.value;
    console.log(`grossAmount=${ps?.grossAmount}, amount=${ps?.amount}, number=${ps?.number}`);
    console.log(`specifications count=${ps?.specifications?.length}`);
    ps?.specifications?.forEach((s: any) => {
      console.log(`  - ${s.salaryType?.name}: amount=${s.amount}, rate=${s.rate}, count=${s.count}`);
    });
    console.log(`payslipNumber=${ps?.number}`);
    console.log(`compilation:`, JSON.stringify(ps?.compilation));
  }

  // Now check the salary transaction
  const txCheck = await api("GET", `/salary/transaction/${txId}?fields=*`);
  console.log("\n=== SALARY TRANSACTION ===");
  console.log(JSON.stringify(txCheck.data.value, null, 2));

  // Get voucher type and accounts
  const [vtRes, accRes] = await Promise.all([
    api("GET", "/ledger/voucherType?name=L%C3%B8nnsbilag&count=1&fields=*"),
    api("GET", "/ledger/account?number=5000,1920&count=10&fields=*"),
  ]);
  const voucherTypeId = vtRes.data.values?.[0]?.id;
  const acc5000 = accRes.data.values?.find((a: any) => a.number === 5000);
  const acc1920 = accRes.data.values?.find((a: any) => a.number === 1920);
  console.log(`VoucherType Lønnsbilag: id=${voucherTypeId}`);
  console.log(`Accounts: 5000 id=${acc5000?.id}, 1920 id=${acc1920?.id}`);

  // Create Lønnsbilag voucher
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
  console.log(`\nVoucher: ${voucherRes.status}, id=${voucherRes.data.value?.id}, number=${voucherRes.data.value?.number}`);

  // Inspect payslip state AFTER voucher
  if (payslipId) {
    const psAfter = await api("GET", `/salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`);
    console.log("\n=== PAYSLIP AFTER VOUCHER ===");
    const ps = psAfter.data.value;
    console.log(`grossAmount=${ps?.grossAmount}, amount=${ps?.amount}, number=${ps?.number}`);
    console.log(`specifications count=${ps?.specifications?.length}`);
    ps?.specifications?.forEach((s: any) => {
      console.log(`  - ${s.salaryType?.name}: amount=${s.amount}, rate=${s.rate}, count=${s.count}`);
    });
    console.log(`compilation:`, JSON.stringify(ps?.compilation));
  }

  // Also check: what does the employee record look like now?
  const empAfter = await api("GET", `/employee/${empId}?fields=*`);
  console.log("\n=== EMPLOYEE AFTER PAYROLL ===");
  const e = empAfter.data.value;
  console.log(`dateOfBirth=${e?.dateOfBirth}`);
  console.log(`employments:`, JSON.stringify(e?.employments));

  // Check employment details
  const emplAfter = await api("GET", `/employee/employment?employeeId=${empId}&fields=*`);
  console.log("\n=== EMPLOYMENT DETAILS ===");
  emplAfter.data.values?.forEach((emp: any) => {
    console.log(`employment id=${emp.id}, startDate=${emp.startDate}, division.id=${emp.division?.id}`);
    console.log(`  employmentDetails:`, JSON.stringify(emp.employmentDetails));
  });

  console.log("\n=== DONE ===");
}

main().catch(e => console.error(e));
