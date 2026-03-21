const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "wybI1vVJbm2aVwJPZtGVbuyuGFnyEEHG9amcdYDblyM";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const EMAIL = "fernando.lopez@example.org";
const BASE_SALARY = 37850;
const BONUS = 9200;
const GROSS = BASE_SALARY + BONUS;
const YEAR = 2026;
const MONTH = 3;
const PAYROLL_DATE = "2026-03-21";
const PERIOD_START = "2026-03-01";

function generateNorwegianOrgNumber(): string {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  while (true) {
    const digits = [9];
    for (let i = 0; i < 7; i++) digits.push(Math.floor(Math.random() * 10));
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += digits[i] * weights[i];
    const remainder = sum % 11;
    if (remainder === 1) continue; // invalid
    const check = remainder === 0 ? 0 : 11 - remainder;
    digits.push(check);
    return digits.join("");
  }
}

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  console.log(`\n>>> ${method} ${path}`);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`<<< ${res.status}`);
  if (!res.ok) {
    console.log("ERROR:", JSON.stringify(data, null, 2));
    throw new Error(`${method} ${path} failed with ${res.status}`);
  }
  return data;
}

async function main() {
  // Step 1: Find employee
  const empRes = await api("GET", `/employee?email=${EMAIL}&count=10&fields=*`);
  const employees = empRes.values || [];
  const emp = employees.find((e: any) => e.email === EMAIL);
  if (!emp) throw new Error("Employee not found");
  console.log(`Employee id=${emp.id}, name=${emp.firstName} ${emp.lastName}, dob=${emp.dateOfBirth}, employments=${JSON.stringify(emp.employments)}`);

  const underconfigured = emp.dateOfBirth === null && (!emp.employments || emp.employments.length === 0);
  let divisionId: number | undefined;
  let employmentId: number | undefined;

  if (underconfigured) {
    // Step 2: Check division
    const divRes = await api("GET", "/division?count=1&fields=*");
    const divisions = divRes.values || [];

    if (divisions.length > 0) {
      divisionId = divisions[0].id;
      console.log(`Existing division id=${divisionId}`);
    } else {
      // Step 3: Create division
      const orgNum = generateNorwegianOrgNumber();
      console.log(`Creating division with org number ${orgNum}`);
      const divCreate = await api("POST", "/division", {
        name: "Hovudavdeling",
        organizationNumber: orgNum,
        startDate: "2026-01-01",
        municipalityDate: "2026-01-01",
        municipality: { id: 1 },
      });
      divisionId = divCreate.value.id;
      console.log(`Created division id=${divisionId}`);
    }

    // Step 4: Set dateOfBirth
    await api("PUT", `/employee/${emp.id}`, {
      id: emp.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      dateOfBirth: "1990-01-01",
    });
    console.log("Set dateOfBirth=1990-01-01");

    // Step 5: Create employment
    const emplRes = await api("POST", "/employee/employment", {
      employee: { id: emp.id },
      division: { id: divisionId },
      startDate: PERIOD_START,
      isMainEmployer: true,
      taxDeductionCode: "loennFraHovedarbeidsgiver",
    });
    employmentId = emplRes.value.id;
    console.log(`Created employment id=${employmentId}`);

    // Step 6: Create employment details
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
    console.log(`Created employment details with monthlySalary=${BASE_SALARY}`);
  } else {
    // Payroll-ready or needs conditional employment check
    const employments = emp.employments || [];
    if (employments.length === 0 || (employments.length > 0 && !employments[0].startDate)) {
      const emplRes = await api("GET", `/employee/employment?employeeId=${emp.id}&count=20&fields=*`);
      console.log(`Employment details: ${JSON.stringify(emplRes.values?.length)} employments found`);
    }
  }

  // Step 7: Get salary types
  const stRes = await api("GET", "/salary/type?count=1000&fields=*");
  const salaryTypes = stRes.values || [];
  const fastlonn = salaryTypes.find((t: any) => t.name === "Fastlønn");
  const bonus = salaryTypes.find((t: any) => t.name === "Bonus");
  if (!fastlonn || !bonus) throw new Error(`Missing salary types: Fastlønn=${fastlonn?.id}, Bonus=${bonus?.id}`);
  console.log(`Fastlønn id=${fastlonn.id}, Bonus id=${bonus.id}`);

  // Step 8: Create salary transaction
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
  const txId = txRes.value.id;
  const payslipId = txRes.value.payslips?.[0]?.id;
  console.log(`Created salary transaction id=${txId}, payslip id=${payslipId}`);

  // Step 9: Create Lønnsbilag voucher
  // Resolve account 5000 and 1920
  const acc5000Res = await api("GET", "/ledger/account?number=5000&count=1&fields=*");
  const acc1920Res = await api("GET", "/ledger/account?number=1920&count=1&fields=*");
  const acc5000 = acc5000Res.values?.[0];
  const acc1920 = acc1920Res.values?.[0];
  if (!acc5000 || !acc1920) throw new Error(`Missing accounts: 5000=${acc5000?.id}, 1920=${acc1920?.id}`);
  console.log(`Account 5000 id=${acc5000.id}, Account 1920 id=${acc1920.id}`);

  const voucherRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: PAYROLL_DATE,
    description: `Lønn mars 2026 - Fastlønn ${BASE_SALARY} + Bonus ${BONUS}`,
    voucherType: { id: 9744848 },
    postings: [
      {
        account: { id: acc5000.id },
        amount: BASE_SALARY,
        amountCurrency: BASE_SALARY,
        amountGross: BASE_SALARY,
        amountGrossCurrency: BASE_SALARY,
        description: "Fastlønn mars 2026",
      },
      {
        account: { id: acc5000.id },
        amount: BONUS,
        amountCurrency: BONUS,
        amountGross: BONUS,
        amountGrossCurrency: BONUS,
        description: "Bonus mars 2026",
      },
      {
        account: { id: acc1920.id },
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        description: `Lønn mars 2026 - total ${GROSS}`,
      },
    ],
  });
  console.log(`Created voucher id=${voucherRes.value.id}, number=${voucherRes.value.number}`);

  console.log("\n=== DONE ===");
  console.log(`Employee: ${emp.firstName} ${emp.lastName} (id=${emp.id})`);
  console.log(`Salary transaction id=${txId}`);
  console.log(`Payslip id=${payslipId}`);
  console.log(`Fastlønn: ${BASE_SALARY}, Bonus: ${BONUS}, Gross: ${GROSS}`);
  console.log(`Voucher id=${voucherRes.value.id}, number=${voucherRes.value.number}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
