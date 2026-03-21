// Full end-to-end proof of optimal payroll path in sandbox
// Tests the complete no-division underconfigured employee branch
// with the corrected voucher creation (dynamic voucherType + row fields + combined account lookup)

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const BASE_SALARY = 37850;
const BONUS = 9200;
const GROSS = BASE_SALARY + BONUS;
const YEAR = 2026;
const MONTH = 3;
const PAYROLL_DATE = "2026-03-21";
const PERIOD_START = "2026-03-01";

let callCount = 0;
let errorCount = 0;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  callCount++;
  console.log(`\n[Call ${callCount}] >>> ${method} ${path}`);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`<<< ${res.status}`);
  if (!res.ok) {
    errorCount++;
    console.log("ERROR:", JSON.stringify(data, null, 2).substring(0, 500));
  }
  return { ok: res.ok, status: res.status, data };
}

function generateNorwegianOrgNumber(): string {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  while (true) {
    const digits = [9];
    for (let i = 0; i < 7; i++) digits.push(Math.floor(Math.random() * 10));
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += digits[i] * weights[i];
    const remainder = sum % 11;
    if (remainder === 1) continue;
    const check = remainder === 0 ? 0 : 11 - remainder;
    digits.push(check);
    return digits.join("");
  }
}

async function main() {
  // Step 0: Create a disposable underconfigured employee for this proof
  console.log("=== Creating disposable underconfigured employee ===");
  const uniq = `payroll-proof-${Date.now()}@example.org`;
  const empCreate = await api("POST", "/employee", {
    firstName: "PayrollProof",
    lastName: `T${Date.now()}`,
    email: uniq,
  });
  if (!empCreate.ok) throw new Error("Could not create test employee");
  const testEmpId = empCreate.data.value.id;
  console.log(`Created test employee id=${testEmpId}, email=${uniq}`);
  console.log(`dateOfBirth=${empCreate.data.value.dateOfBirth}, employments=${JSON.stringify(empCreate.data.value.employments)}`);

  console.log("\n========================================");
  console.log("=== NOW: Optimal payroll path proof ===");
  console.log("========================================");
  callCount = 0; // Reset call counter for the actual payroll path
  errorCount = 0;

  // Step 1: GET /employee (in production, would find existing employee)
  const empRes = await api("GET", `/employee?email=${uniq}&count=10&fields=*`);
  const emp = empRes.data.values?.find((e: any) => e.email === uniq);
  if (!emp) throw new Error("Employee not found");
  console.log(`Employee id=${emp.id}, dob=${emp.dateOfBirth}, employments=${JSON.stringify(emp.employments)}`);

  // Underconfigured: dateOfBirth=null, employments=[]
  // Step 2: GET /division
  const divRes = await api("GET", "/division?count=1&fields=*");
  const divisions = divRes.data.values || [];
  let divisionId: number;

  if (divisions.length > 0) {
    divisionId = divisions[0].id;
    console.log(`Existing division id=${divisionId}`);
  } else {
    // Step 3: POST /division (only if needed)
    const orgNum = generateNorwegianOrgNumber();
    const divCreate = await api("POST", "/division", {
      name: "Hovudavdeling",
      organizationNumber: orgNum,
      startDate: "2026-01-01",
      municipalityDate: "2026-01-01",
      municipality: { id: 1 },
    });
    divisionId = divCreate.data.value.id;
    console.log(`Created division id=${divisionId}`);
  }

  // Step 4: PUT /employee (dateOfBirth)
  await api("PUT", `/employee/${emp.id}`, {
    id: emp.id,
    firstName: emp.firstName,
    lastName: emp.lastName,
    dateOfBirth: "1990-01-01",
  });

  // Step 5: POST /employee/employment
  const emplRes = await api("POST", "/employee/employment", {
    employee: { id: emp.id },
    division: { id: divisionId },
    startDate: PERIOD_START,
    isMainEmployer: true,
    taxDeductionCode: "loennFraHovedarbeidsgiver",
  });
  const employmentId = emplRes.data.value.id;

  // Step 6: POST /employee/employment/details
  await api("POST", "/employee/employment/details", {
    employment: { id: employmentId },
    date: PERIOD_START,
    employmentType: "ORDINARY",
    employmentForm: "PERMANENT",
    remunerationType: "MONTHLY_WAGE",
    workingHoursScheme: "NOT_SHIFT",
    percentageOfFullTimeEquivalent: 100,
    monthlySalary: BASE_SALARY,
    annualSalary: BASE_SALARY * 12,
  });

  // Step 7: Parallel reads — salary types + voucherType + accounts
  // These 3 reads are independent and can be done in parallel
  const [stRes, vtRes, accRes] = await Promise.all([
    api("GET", "/salary/type?count=1000&fields=*"),
    api("GET", "/ledger/voucherType?name=Lønnsbilag&count=1&fields=*"),
    api("GET", "/ledger/account?number=5000,1920&count=10&fields=*"),
  ]);

  const salaryTypes = stRes.data.values || [];
  const fastlonn = salaryTypes.find((t: any) => t.name === "Fastlønn");
  const bonus = salaryTypes.find((t: any) => t.name === "Bonus");
  console.log(`Fastlønn id=${fastlonn?.id}, Bonus id=${bonus?.id}`);

  const lonnVoucherType = vtRes.data.values?.[0];
  console.log(`Lønnsbilag voucherType id=${lonnVoucherType?.id}`);

  const acc5000 = accRes.data.values?.find((a: any) => a.number === 5000);
  const acc1920 = accRes.data.values?.find((a: any) => a.number === 1920);
  console.log(`Account 5000 id=${acc5000?.id}, Account 1920 id=${acc1920?.id}`);

  if (!fastlonn || !bonus || !lonnVoucherType || !acc5000 || !acc1920) {
    throw new Error("Missing required lookup data");
  }

  // Step 8: POST /salary/transaction
  const txRes = await api("POST", "/salary/transaction?generateTaxDeduction=true", {
    date: PAYROLL_DATE,
    year: YEAR,
    month: MONTH,
    paySlipsAvailableDate: PAYROLL_DATE,
    payslips: [
      {
        employee: { id: emp.id },
        date: PAYROLL_DATE,
        year: YEAR,
        month: MONTH,
        specifications: [
          {
            employee: { id: emp.id },
            salaryType: { id: fastlonn.id },
            description: "Fastlønn mars 2026",
            year: YEAR,
            month: MONTH,
            count: 1,
            rate: BASE_SALARY,
            amount: BASE_SALARY,
          },
          {
            employee: { id: emp.id },
            salaryType: { id: bonus.id },
            description: "Bonus mars 2026",
            year: YEAR,
            month: MONTH,
            count: 1,
            rate: BONUS,
            amount: BONUS,
          },
        ],
      },
    ],
  });
  const txId = txRes.data.value?.id;
  const payslipId = txRes.data.value?.payslips?.[0]?.id;
  console.log(`Salary transaction id=${txId}, payslip id=${payslipId}`);

  // Step 9: POST /ledger/voucher (with correct voucherType + row fields)
  const vRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: PAYROLL_DATE,
    description: `Lønn mars 2026 - Fastlønn ${BASE_SALARY} + Bonus ${BONUS}`,
    voucherType: { id: lonnVoucherType.id },
    postings: [
      {
        row: 1,
        account: { id: acc5000.id },
        amount: BASE_SALARY,
        amountCurrency: BASE_SALARY,
        amountGross: BASE_SALARY,
        amountGrossCurrency: BASE_SALARY,
        description: "Fastlønn mars 2026",
      },
      {
        row: 2,
        account: { id: acc5000.id },
        amount: BONUS,
        amountCurrency: BONUS,
        amountGross: BONUS,
        amountGrossCurrency: BONUS,
        description: "Bonus mars 2026",
      },
      {
        row: 3,
        account: { id: acc1920.id },
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        description: `Lønn mars 2026`,
      },
    ],
  });

  console.log(`\nVoucher created: id=${vRes.data.value?.id}, number=${vRes.data.value?.number}`);

  console.log("\n========================================");
  console.log(`=== RESULT: ${callCount} API calls, ${errorCount} errors ===`);
  console.log("========================================");
  console.log("Path taken:");
  console.log("  1. GET /employee");
  console.log("  2. GET /division");
  console.log("  3. PUT /employee (dateOfBirth)");
  console.log("  4. POST /employee/employment");
  console.log("  5. POST /employee/employment/details");
  console.log("  6. GET /salary/type (parallel)");
  console.log("  7. GET /ledger/voucherType?name=Lønnsbilag (parallel)");
  console.log("  8. GET /ledger/account?number=5000,1920 (parallel)");
  console.log("  9. POST /salary/transaction");
  console.log("  10. POST /ledger/voucher");
  console.log(`Note: Division existed, so no POST /division needed. With division creation: +1 call = 11 total`);
}

main().catch((e) => { console.error(e); process.exit(1); });
