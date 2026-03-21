// Task 12: Full end-to-end payroll flow sandbox test
// Tests the complete underconfigured-employee branch with:
//   - Employee lookup
//   - Division check/create
//   - Employee repair (dateOfBirth)
//   - Employment creation with INLINE employmentDetails (saves 1 call)
//   - Parallel salary type + voucherType + account lookups
//   - Salary transaction with generateTaxDeduction=true
//   - Lonnsbilag voucher with dynamic voucherType + row fields
//   - Verification: payslip + employee readback

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const BASE_SALARY = 42500;
const BONUS = 8750;
const GROSS = BASE_SALARY + BONUS;
const YEAR = 2026;
const MONTH = 12; // December - avoids reconciled bank periods in sandbox
const PAYROLL_DATE = "2026-12-15";
const PERIOD_START = "2026-12-01";

let callCount = 0;
let errorCount = 0;

async function api(method: string, path: string, body?: any): Promise<{ ok: boolean; status: number; data: any }> {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  callCount++;
  const callNum = callCount;
  console.log(`\n[Call ${callNum}] >>> ${method} ${path}`);
  if (body) console.log(`    Body: ${JSON.stringify(body).substring(0, 300)}`);

  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`[Call ${callNum}] <<< ${res.status} ${res.statusText}`);

  if (!res.ok) {
    errorCount++;
    const errStr = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    console.log(`[Call ${callNum}] ERROR:\n${errStr.substring(0, 800)}`);
  } else {
    // Print summary of response
    if (data?.value) {
      console.log(`[Call ${callNum}] Response value id=${data.value.id}`);
    } else if (data?.values) {
      console.log(`[Call ${callNum}] Response: ${data.values.length} items, fullResultSize=${data.fullResultSize}`);
    }
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
  console.log("=".repeat(60));
  console.log("TASK 12 PAYROLL: Full end-to-end sandbox test");
  console.log("=".repeat(60));
  console.log(`Base salary: ${BASE_SALARY}, Bonus: ${BONUS}, Gross: ${GROSS}`);
  console.log(`Period: ${YEAR}-${MONTH} (${PAYROLL_DATE})`);

  // ====== SETUP: Create a disposable underconfigured employee ======
  console.log("\n--- SETUP: Creating disposable underconfigured employee ---");
  const uniq = `payroll-test-${Date.now()}@example.org`;
  // First find a department id for setup (sandbox requires it for employee creation)
  const deptSetup = await api("GET", "/department?count=1&fields=id");
  const setupDeptId = deptSetup.data.values?.[0]?.id;
  if (!setupDeptId) throw new Error("No department found for employee setup");
  console.log(`Setup: Using department id=${setupDeptId}`);

  const setupRes = await api("POST", "/employee", {
    firstName: "PayrollTest",
    lastName: `E${Date.now() % 100000}`,
    email: uniq,
    userType: "STANDARD",
    allowInformationRegistration: true,
    department: { id: setupDeptId },
  });
  if (!setupRes.ok) throw new Error("Could not create test employee");
  const testEmpId = setupRes.data.value.id;
  console.log(`Setup: Created employee id=${testEmpId}, email=${uniq}`);
  console.log(`Setup: dateOfBirth=${setupRes.data.value.dateOfBirth}, employments=${JSON.stringify(setupRes.data.value.employments)}`);

  // Reset counters for the actual payroll path
  callCount = 0;
  errorCount = 0;

  console.log("\n" + "=".repeat(60));
  console.log("PAYROLL PATH: Starting (simulates production agent)");
  console.log("=".repeat(60));

  // ====== STEP 1: GET /employee (find by email) ======
  console.log("\n--- Step 1: Find employee by email ---");
  const empRes = await api("GET", `/employee?email=${encodeURIComponent(uniq)}&count=10&fields=*`);
  if (!empRes.ok) throw new Error("Employee search failed");
  const employees = empRes.data.values || [];
  const emp = employees.find((e: any) => e.email === uniq);
  if (!emp) throw new Error(`Employee not found for email ${uniq}`);
  console.log(`Found employee: id=${emp.id}, name=${emp.firstName} ${emp.lastName}`);
  console.log(`  dateOfBirth=${emp.dateOfBirth}`);
  console.log(`  employments=${JSON.stringify(emp.employments)}`);

  const underconfigured = emp.dateOfBirth === null && (!emp.employments || emp.employments.length === 0);
  console.log(`  underconfigured=${underconfigured}`);

  if (!underconfigured) {
    console.log("Employee is already configured - checking if payroll-ready...");
    // Would do conditional GET /employee/employment here
  }

  // ====== STEP 2: GET /division ======
  console.log("\n--- Step 2: Check for existing division ---");
  const divRes = await api("GET", "/division?count=1&fields=*");
  if (!divRes.ok) throw new Error("Division check failed");
  const divisions = divRes.data.values || [];
  let divisionId: number;

  if (divisions.length > 0) {
    divisionId = divisions[0].id;
    console.log(`Division exists: id=${divisionId}, name=${divisions[0].name}`);
  } else {
    // ====== STEP 2b: POST /division (create if needed) ======
    console.log("\n--- Step 2b: Creating division (none exists) ---");
    const orgNum = generateNorwegianOrgNumber();
    console.log(`Generated org number: ${orgNum}`);
    const divCreate = await api("POST", "/division", {
      name: "Hovudavdeling",
      organizationNumber: orgNum,
      startDate: `${YEAR}-01-01`,
      municipalityDate: `${YEAR}-01-01`,
      municipality: { id: 1 },
    });
    if (!divCreate.ok) throw new Error("Division creation failed");
    divisionId = divCreate.data.value.id;
    console.log(`Created division: id=${divisionId}`);
  }

  // ====== STEP 3+4: Repair employee + create employment (with inline details) ======
  // AND parallel reads for salary types, voucherType, accounts
  console.log("\n--- Steps 3-7: Repair employee + parallel lookups ---");

  // Chain A (sequential): PUT employee -> POST employment (with inline details)
  // Chain B (parallel): GET salary/type + GET voucherType + GET accounts
  const [repairResult, stRes, vtRes, accRes] = await Promise.all([
    // Chain A: sequential repair
    (async () => {
      // Step 3: PUT /employee (set dateOfBirth)
      console.log("  Chain A: Setting dateOfBirth...");
      const putRes = await api("PUT", `/employee/${emp.id}`, {
        id: emp.id,
        firstName: emp.firstName,
        lastName: emp.lastName,
        dateOfBirth: "1990-01-01",
      });
      if (!putRes.ok) throw new Error("Employee dateOfBirth update failed");
      console.log(`  dateOfBirth set to 1990-01-01`);

      // Step 4: POST /employee/employment WITH INLINE employmentDetails
      console.log("  Chain A: Creating employment with inline details...");
      const emplRes = await api("POST", "/employee/employment", {
        employee: { id: emp.id },
        division: { id: divisionId },
        startDate: PERIOD_START,
        isMainEmployer: true,
        taxDeductionCode: "loennFraHovedarbeidsgiver",
        employmentDetails: [{
          date: PERIOD_START,
          employmentType: "ORDINARY",
          employmentForm: "PERMANENT",
          remunerationType: "MONTHLY_WAGE",
          workingHoursScheme: "NOT_SHIFT",
          percentageOfFullTimeEquivalent: 100,
          monthlySalary: BASE_SALARY,
          annualSalary: BASE_SALARY * 12,
        }],
      });
      if (!emplRes.ok) throw new Error("Employment creation failed");
      console.log(`  Employment created: id=${emplRes.data.value.id}`);
      return emplRes;
    })(),

    // Chain B: parallel reads
    api("GET", "/salary/type?count=1000&fields=*"),
    api("GET", `/ledger/voucherType?name=${encodeURIComponent("Lønnsbilag")}&count=1&fields=*`),
    api("GET", "/ledger/account?number=5000,1920&count=10&fields=*"),
  ]);

  // Parse parallel read results
  console.log("\n--- Parsing lookup results ---");
  const salaryTypes = stRes.data.values || [];
  const fastlonn = salaryTypes.find((t: any) => t.name === "Fastlønn");
  const bonus = salaryTypes.find((t: any) => t.name === "Bonus");
  console.log(`Fastlonn: id=${fastlonn?.id}, number=${fastlonn?.number}`);
  console.log(`Bonus: id=${bonus?.id}, number=${bonus?.number}`);

  const lonnVoucherType = vtRes.data.values?.[0];
  console.log(`Lonnsbilag voucherType: id=${lonnVoucherType?.id}, name=${lonnVoucherType?.name}`);

  const accounts = accRes.data.values || [];
  const acc5000 = accounts.find((a: any) => a.number === 5000);
  const acc1920 = accounts.find((a: any) => a.number === 1920);
  console.log(`Account 5000: id=${acc5000?.id}, name=${acc5000?.name}`);
  console.log(`Account 1920: id=${acc1920?.id}, name=${acc1920?.name}`);

  if (!fastlonn) throw new Error("Fastlonn salary type not found");
  if (!bonus) throw new Error("Bonus salary type not found");
  if (!lonnVoucherType) throw new Error("Lonnsbilag voucherType not found");
  if (!acc5000) throw new Error("Account 5000 not found");
  if (!acc1920) throw new Error("Account 1920 not found");

  // ====== STEP 8: POST /salary/transaction ======
  console.log("\n--- Step 8: Create salary transaction ---");
  const txRes = await api("POST", "/salary/transaction?generateTaxDeduction=true", {
    date: PAYROLL_DATE,
    year: YEAR,
    month: MONTH,
    paySlipsAvailableDate: PAYROLL_DATE,
    payslips: [{
      employee: { id: emp.id },
      date: PAYROLL_DATE,
      year: YEAR,
      month: MONTH,
      specifications: [
        {
          employee: { id: emp.id },
          salaryType: { id: fastlonn.id },
          description: `Fastlonn desember ${YEAR}`,
          year: YEAR,
          month: MONTH,
          count: 1,
          rate: BASE_SALARY,
          amount: BASE_SALARY,
        },
        {
          employee: { id: emp.id },
          salaryType: { id: bonus.id },
          description: `Bonus desember ${YEAR}`,
          year: YEAR,
          month: MONTH,
          count: 1,
          rate: BONUS,
          amount: BONUS,
        },
      ],
    }],
  });

  if (!txRes.ok) {
    console.log("SALARY TRANSACTION FAILED - dumping full response");
    console.log(JSON.stringify(txRes.data, null, 2));
    throw new Error("Salary transaction creation failed");
  }

  const txId = txRes.data.value?.id;
  const payslipId = txRes.data.value?.payslips?.[0]?.id;
  console.log(`Salary transaction: id=${txId}`);
  console.log(`Payslip: id=${payslipId}`);
  console.log(`Full tx response: ${JSON.stringify(txRes.data.value, null, 2)}`);

  // ====== STEP 9: POST /ledger/voucher ======
  console.log("\n--- Step 9: Create Lonnsbilag voucher ---");
  const vRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: PAYROLL_DATE,
    description: `Lonn desember ${YEAR} - Fastlonn ${BASE_SALARY} + Bonus ${BONUS}`,
    voucherType: { id: lonnVoucherType.id },
    postings: [
      {
        row: 1,
        account: { id: acc5000.id },
        amount: BASE_SALARY,
        amountCurrency: BASE_SALARY,
        amountGross: BASE_SALARY,
        amountGrossCurrency: BASE_SALARY,
        description: `Fastlonn desember ${YEAR}`,
      },
      {
        row: 2,
        account: { id: acc5000.id },
        amount: BONUS,
        amountCurrency: BONUS,
        amountGross: BONUS,
        amountGrossCurrency: BONUS,
        description: `Bonus desember ${YEAR}`,
      },
      {
        row: 3,
        account: { id: acc1920.id },
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        description: `Lonn desember ${YEAR}`,
      },
    ],
  });

  if (!vRes.ok) {
    console.log("VOUCHER CREATION FAILED - dumping full response");
    console.log(JSON.stringify(vRes.data, null, 2));
    // Don't throw - still want to verify what we have
  } else {
    console.log(`Voucher: id=${vRes.data.value?.id}, number=${vRes.data.value?.number}`);
    console.log(`Full voucher response: ${JSON.stringify(vRes.data.value, null, 2).substring(0, 500)}`);
  }

  // ====== VERIFICATION ======
  console.log("\n" + "=".repeat(60));
  console.log("VERIFICATION");
  console.log("=".repeat(60));

  // Verify payslip
  if (payslipId) {
    console.log("\n--- Verify payslip ---");
    const psRes = await api("GET", `/salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`);
    if (psRes.ok) {
      const ps = psRes.data.value;
      console.log(`Payslip id=${ps.id}:`);
      console.log(`  grossAmount=${ps.grossAmount}`);
      console.log(`  amount=${ps.amount}`);
      console.log(`  number=${ps.number}`);
      console.log(`  year=${ps.year}, month=${ps.month}`);
      if (ps.specifications) {
        console.log(`  specifications (${ps.specifications.length} total):`);
        for (const s of ps.specifications) {
          console.log(`    - ${s.salaryType?.name || s.salaryType?.id}: amount=${s.amount}, rate=${s.rate}, count=${s.count}, desc="${s.description}"`);
        }
      }
    }
  }

  // Verify salary transaction
  if (txId) {
    console.log("\n--- Verify salary transaction ---");
    const stxRes = await api("GET", `/salary/transaction/${txId}?fields=*`);
    if (stxRes.ok) {
      console.log(`Transaction: ${JSON.stringify(stxRes.data.value, null, 2).substring(0, 500)}`);
    }
  }

  // Verify employee state
  console.log("\n--- Verify employee final state ---");
  const empFinal = await api("GET", `/employee/${emp.id}?fields=*`);
  if (empFinal.ok) {
    const e = empFinal.data.value;
    console.log(`Employee id=${e.id}:`);
    console.log(`  name=${e.firstName} ${e.lastName}`);
    console.log(`  email=${e.email}`);
    console.log(`  dateOfBirth=${e.dateOfBirth}`);
    console.log(`  employments=${JSON.stringify(e.employments)}`);
  }

  // Verify employment details
  console.log("\n--- Verify employment details (inline employmentDetails check) ---");
  const emplFinal = await api("GET", `/employee/employment?employeeId=${emp.id}&count=20&fields=*,employmentDetails(*)`);
  if (emplFinal.ok) {
    const empls = emplFinal.data.values || [];
    for (const empl of empls) {
      console.log(`Employment id=${empl.id}:`);
      console.log(`  startDate=${empl.startDate}`);
      console.log(`  division.id=${empl.division?.id}`);
      console.log(`  isMainEmployer=${empl.isMainEmployer}`);
      console.log(`  taxDeductionCode=${empl.taxDeductionCode}`);
      if (empl.employmentDetails) {
        for (const d of empl.employmentDetails) {
          console.log(`  Detail: remunerationType=${d.remunerationType}, monthlySalary=${d.monthlySalary}, annualSalary=${d.annualSalary}, percentageOfFullTimeEquivalent=${d.percentageOfFullTimeEquivalent}`);
        }
      }
    }
  }

  // ====== SUMMARY ======
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total API calls (payroll path only): ${callCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Employee: ${emp.firstName} ${emp.lastName} (id=${emp.id})`);
  console.log(`Division: id=${divisionId}`);
  console.log(`Employment: id=${repairResult.data.value?.id}`);
  console.log(`Salary transaction: id=${txId}`);
  console.log(`Payslip: id=${payslipId}`);
  console.log(`Voucher: id=${vRes.ok ? vRes.data.value?.id : "FAILED"}`);
  console.log(`Base salary: ${BASE_SALARY}, Bonus: ${BONUS}, Gross: ${GROSS}`);
  console.log();
  console.log("Path taken:");
  console.log("  1. GET /employee?email=...  (find employee)");
  console.log("  2. GET /division?count=1    (check division)");
  console.log("  --- parallel block ---");
  console.log("  3. PUT /employee/{id}       (set dateOfBirth) [chain A]");
  console.log("  4. POST /employee/employment (with inline employmentDetails) [chain A]");
  console.log("  5. GET /salary/type          [chain B, parallel]");
  console.log("  6. GET /ledger/voucherType   [chain B, parallel]");
  console.log("  7. GET /ledger/account       [chain B, parallel]");
  console.log("  --- end parallel block ---");
  console.log("  8. POST /salary/transaction?generateTaxDeduction=true");
  console.log("  9. POST /ledger/voucher?sendToLedger=true (with row fields)");
  console.log();
  if (errorCount === 0) {
    console.log("SUCCESS: All steps completed without errors!");
  } else {
    console.log(`ISSUES: ${errorCount} errors encountered - see above for details`);
  }
}

main().catch((e) => {
  console.error("\nFATAL:", e.message || e);
  process.exit(1);
});
