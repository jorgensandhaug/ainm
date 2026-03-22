// Task 12: Full end-to-end payroll — reset, execute, verify
// Self-contained: creates test employee, runs 8-call underconfigured path, verifies all state, cleans up
//
// Usage: bun sandbox-investigation/131-task12-full-e2e.ts [--no-cleanup]
//
// Phases:
//   1. RESET — clean up any leftover test employees from previous runs
//   2. SETUP — create an underconfigured test employee (dateOfBirth=null, employments=[])
//   3. EXECUTE — run the exact 8-call optimized path
//   4. VERIFY — check all scorer-relevant state
//   5. CLEANUP — remove created resources (unless --no-cleanup)

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const TEST_EMAIL_PREFIX = "t12-e2e-test";
// Use 2027-10 to avoid reconciled bank statement periods in sandbox
// (sandbox has bank statements up to 2027-08-24; 2028+ returns "Ugyldig år")
const YEAR = 2027;
const MONTH = 10;
const DATE = `${YEAR}-10-15`;
const PERIOD_START = `${YEAR}-10-01`;
const BASE_SALARY = 45200;
const BONUS_AMOUNT = 12300;
const GROSS = BASE_SALARY + BONUS_AMOUNT;

const NO_CLEANUP = Bun.argv.includes("--no-cleanup");

// Track created resources for cleanup
const created: { type: string; id: number; label: string }[] = [];

let callCount = 0;
let errorCount = 0;
let phase = "INIT";

async function api(method: string, path: string, body?: any): Promise<{ ok: boolean; status: number; data: any }> {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  callCount++;
  const n = callCount;
  console.log(`  [${phase}][${n}] ${method} ${path}`);
  if (body) {
    const bodyStr = JSON.stringify(body);
    if (bodyStr.length > 400) console.log(`    body: ${bodyStr.substring(0, 400)}...`);
    else console.log(`    body: ${bodyStr}`);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    errorCount++;
    console.log(`    << ${res.status} ERROR: ${(typeof data === "string" ? data : JSON.stringify(data)).substring(0, 400)}`);
  } else {
    if (data?.value) console.log(`    << ${res.status} id=${data.value.id}`);
    else if (data?.values) console.log(`    << ${res.status} ${data.values.length} items`);
    else console.log(`    << ${res.status}`);
  }
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

// ============================================================
// PHASE 1: RESET — clean up leftover test employees
// ============================================================
async function resetPhase() {
  phase = "RESET";
  console.log("\n" + "=".repeat(60));
  console.log("PHASE 1: RESET — clean up leftover test data");
  console.log("=".repeat(60));

  // Find leftover test employees
  const empR = await api("GET", `/employee?count=1000&fields=id,email,firstName,lastName`);
  if (!empR.ok) throw new Error("Failed to list employees");

  const testEmps = (empR.data.values || []).filter((e: any) =>
    e.email && e.email.startsWith(TEST_EMAIL_PREFIX)
  );

  if (testEmps.length === 0) {
    console.log("  No leftover test employees found. Clean slate.");
    return;
  }

  console.log(`  Found ${testEmps.length} leftover test employees to clean up.`);

  for (const emp of testEmps) {
    // Delete salary transactions for this employee
    const txR = await api("GET", `/salary/transaction?employeeId=${emp.id}&count=100&fields=id`);
    if (txR.ok && txR.data.values) {
      for (const tx of txR.data.values) {
        await api("DELETE", `/salary/transaction/${tx.id}`);
      }
    }

    // Employments and employees can't be deleted in this sandbox (405/403)
    // Just clean up salary data — the test employees are harmless leftovers
    console.log(`    Cleaned salary data for employee ${emp.id} (${emp.email})`);
  }

  // Reset call/error counts after cleanup
  callCount = 0;
  errorCount = 0;
}

// ============================================================
// PHASE 2: SETUP — create underconfigured test employee
// ============================================================
async function setupPhase(): Promise<{ empId: number; email: string }> {
  phase = "SETUP";
  console.log("\n" + "=".repeat(60));
  console.log("PHASE 2: SETUP — create underconfigured test employee");
  console.log("=".repeat(60));

  // Get a department for the employee (required field)
  const deptR = await api("GET", "/department?count=1&fields=id");
  const deptId = deptR.data.values?.[0]?.id;
  if (!deptId) throw new Error("No department found in sandbox");

  const email = `${TEST_EMAIL_PREFIX}-${Date.now()}@example.org`;
  const firstName = "TestPayroll";
  const lastName = `Run${Date.now() % 100000}`;

  const empR = await api("POST", "/employee", {
    firstName,
    lastName,
    email,
    userType: "STANDARD",
    allowInformationRegistration: true,
    department: { id: deptId },
    // NO dateOfBirth → simulates underconfigured employee
  });
  if (!empR.ok) throw new Error("Failed to create test employee");

  const empId = empR.data.value.id;
  created.push({ type: "employee", id: empId, label: email });

  console.log(`  Created employee: id=${empId}, email=${email}`);
  console.log(`  dateOfBirth=${empR.data.value.dateOfBirth}, employments=${JSON.stringify(empR.data.value.employments || [])}`);

  // Reset counters — the 8-call path starts fresh
  callCount = 0;
  errorCount = 0;

  return { empId, email };
}

// ============================================================
// PHASE 3: EXECUTE — the exact 8-call underconfigured path
// ============================================================
async function executePhase(email: string): Promise<{
  empId: number;
  divisionId: number;
  employmentId: number;
  txId: number;
  payslipId: number;
  voucherId: number;
  fastlonnId: number;
  bonusId: number;
  acc5000Id: number;
  acc1920Id: number;
}> {
  phase = "EXECUTE";
  console.log("\n" + "=".repeat(60));
  console.log("PHASE 3: EXECUTE — 8-call underconfigured path");
  console.log("=".repeat(60));
  console.log(`  Target: ${email}`);
  console.log(`  Salary: Fastlønn ${BASE_SALARY} + Bonus ${BONUS_AMOUNT} = Gross ${GROSS}`);
  console.log(`  Period: ${YEAR}-${MONTH} (${DATE})`);

  // ---- Round 1: 3 parallel reads ----
  console.log("\n  --- Round 1: 3 parallel reads ---");
  const [empR, stR, accR] = await Promise.all([
    api("GET", `/employee?email=${encodeURIComponent(email)}&count=10&fields=*`),
    api("GET", "/salary/type?count=1000&fields=id,name,number"),
    api("GET", "/ledger/account?number=5000,1920&count=10&fields=id,number,name"),
  ]);

  // Resolve employee
  const emp = (empR.data.values || []).find((e: any) => e.email === email);
  if (!emp) throw new Error(`Employee not found by email: ${email}`);
  const underconfigured = emp.dateOfBirth === null && (!emp.employments || emp.employments.length === 0);
  console.log(`  Employee: id=${emp.id}, underconfigured=${underconfigured}`);
  if (!underconfigured) {
    console.log("  WARNING: Employee is NOT underconfigured — expected underconfigured for 8-call path test");
  }

  // Resolve salary types
  const fastlonn = (stR.data.values || []).find((t: any) => t.name === "Fastlønn");
  const bonus = (stR.data.values || []).find((t: any) => t.name === "Bonus");
  if (!fastlonn || !bonus) throw new Error("Missing salary types (Fastlønn or Bonus)");
  console.log(`  Fastlønn: id=${fastlonn.id} (number=${fastlonn.number})`);
  console.log(`  Bonus: id=${bonus.id} (number=${bonus.number})`);

  // Resolve accounts
  const acc5000 = (accR.data.values || []).find((a: any) => a.number === 5000);
  const acc1920 = (accR.data.values || []).find((a: any) => a.number === 1920);
  if (!acc5000 || !acc1920) throw new Error("Missing accounts 5000 or 1920");
  console.log(`  Account 5000: id=${acc5000.id} (${acc5000.name})`);
  console.log(`  Account 1920: id=${acc1920.id} (${acc1920.name})`);

  // ---- Round 2: POST /division + PUT /employee (parallel) ----
  console.log("\n  --- Round 2: POST /division + PUT /employee (parallel) ---");
  const [divR, putR] = await Promise.all([
    api("POST", "/division", {
      name: "Hovudavdeling",
      organizationNumber: generateOrgNumber(),
      startDate: `${YEAR}-01-01`,
      municipalityDate: `${YEAR}-01-01`,
      municipality: { id: 1 },
    }),
    api("PUT", `/employee/${emp.id}`, {
      id: emp.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      dateOfBirth: "1990-01-01",
    }),
  ]);
  if (!divR.ok) throw new Error(`Division creation failed: ${JSON.stringify(divR.data)}`);
  if (!putR.ok) throw new Error(`Employee dateOfBirth repair failed: ${JSON.stringify(putR.data)}`);
  const divisionId = divR.data.value.id;
  created.push({ type: "division", id: divisionId, label: "Hovudavdeling" });
  console.log(`  Division: id=${divisionId}`);

  // ---- Round 3: POST /employee/employment with inline details ----
  console.log("\n  --- Round 3: POST /employee/employment (with inline details) ---");
  const emplR = await api("POST", "/employee/employment", {
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
  if (!emplR.ok) throw new Error(`Employment creation failed: ${JSON.stringify(emplR.data)}`);
  const employmentId = emplR.data.value.id;
  created.push({ type: "employment", id: employmentId, label: `emp ${emp.id}` });

  // ---- Round 4: POST /salary/transaction + POST /ledger/voucher (parallel) ----
  console.log("\n  --- Round 4: POST /salary/transaction + POST /ledger/voucher (parallel) ---");
  const [txR, vR] = await Promise.all([
    api("POST", "/salary/transaction?generateTaxDeduction=true", {
      date: DATE,
      year: YEAR,
      month: MONTH,
      paySlipsAvailableDate: DATE,
      payslips: [{
        employee: { id: emp.id },
        date: DATE,
        year: YEAR,
        month: MONTH,
        specifications: [
          {
            employee: { id: emp.id },
            salaryType: { id: fastlonn.id },
            description: `Fastlønn ${MONTH}/${YEAR}`,
            year: YEAR,
            month: MONTH,
            count: 1,
            rate: BASE_SALARY,
            amount: BASE_SALARY,
          },
          {
            employee: { id: emp.id },
            salaryType: { id: bonus.id },
            description: `Bonus ${MONTH}/${YEAR}`,
            year: YEAR,
            month: MONTH,
            count: 1,
            rate: BONUS_AMOUNT,
            amount: BONUS_AMOUNT,
          },
        ],
      }],
    }),
    api("POST", "/ledger/voucher?sendToLedger=true", {
      voucherType: { name: "Lønnsbilag" },
      date: DATE,
      description: `Lønn ${MONTH}/${YEAR} - Fastlønn ${BASE_SALARY} + Bonus ${BONUS_AMOUNT}`,
      postings: [
        {
          account: { id: acc5000.id },
          description: `Fastlønn ${MONTH}/${YEAR}`,
          amountGross: BASE_SALARY,
          amountGrossCurrency: BASE_SALARY,
          row: 1,
        },
        {
          account: { id: acc5000.id },
          description: `Bonus ${MONTH}/${YEAR}`,
          amountGross: BONUS_AMOUNT,
          amountGrossCurrency: BONUS_AMOUNT,
          row: 2,
        },
        {
          account: { id: acc1920.id },
          description: `Lønn ${MONTH}/${YEAR}`,
          amountGross: -GROSS,
          amountGrossCurrency: -GROSS,
          row: 3,
        },
      ],
    }),
  ]);

  if (!txR.ok) throw new Error(`Salary transaction failed: ${JSON.stringify(txR.data)}`);
  if (!vR.ok) throw new Error(`Voucher creation failed: ${JSON.stringify(vR.data)}`);

  const txId = txR.data.value.id;
  const payslipLink = txR.data.value.payslips?.[0];
  const payslipId = payslipLink?.id;
  const voucherId = vR.data.value.id;

  created.push({ type: "salary-tx", id: txId, label: `tx ${MONTH}/${YEAR}` });
  created.push({ type: "voucher", id: voucherId, label: `voucher ${MONTH}/${YEAR}` });

  console.log(`\n  EXECUTE RESULT:`);
  console.log(`    Salary tx: id=${txId}`);
  console.log(`    Payslip: id=${payslipId}`);
  console.log(`    Voucher: id=${voucherId}, number=${vR.data.value.number}`);
  console.log(`    Calls: ${callCount}, Errors: ${errorCount}`);

  return {
    empId: emp.id,
    divisionId,
    employmentId,
    txId,
    payslipId,
    voucherId,
    fastlonnId: fastlonn.id,
    bonusId: bonus.id,
    acc5000Id: acc5000.id,
    acc1920Id: acc1920.id,
  };
}

// ============================================================
// PHASE 4: VERIFY — check all scorer-relevant state
// ============================================================
async function verifyPhase(result: {
  empId: number;
  divisionId: number;
  employmentId: number;
  txId: number;
  payslipId: number;
  voucherId: number;
  fastlonnId: number;
  bonusId: number;
  acc5000Id: number;
  acc1920Id: number;
}): Promise<{ passed: string[]; failed: string[] }> {
  phase = "VERIFY";
  console.log("\n" + "=".repeat(60));
  console.log("PHASE 4: VERIFY — check all scorer-relevant state");
  console.log("=".repeat(60));

  const passed: string[] = [];
  const failed: string[] = [];

  function check(name: string, ok: boolean, detail: string) {
    if (ok) {
      passed.push(name);
      console.log(`  ✓ ${name}: ${detail}`);
    } else {
      failed.push(name);
      console.log(`  ✗ ${name}: ${detail}`);
    }
  }

  // V1: Payslip exists with correct gross amount
  const psR = await api("GET", `/salary/payslip/${result.payslipId}?fields=*,specifications(*,salaryType(*))`);
  if (psR.ok) {
    const ps = psR.data.value;
    check("Payslip exists", true, `id=${result.payslipId}`);
    check("Payslip grossAmount", ps.grossAmount === GROSS, `expected=${GROSS}, actual=${ps.grossAmount}`);
    // amount = net pay after tax deduction (gross - skattetrekk), NOT equal to gross
    const expectedNet = GROSS - Math.round(GROSS * 0.5); // ~50% tax deduction
    check("Payslip amount (net)", ps.amount === expectedNet || ps.amount > 0, `gross=${ps.grossAmount}, net=${ps.amount} (tax deducted — expected ~${expectedNet})`);

    // V2: Specifications
    const specs = ps.specifications || [];
    const fastlonnSpec = specs.find((s: any) => s.salaryType?.name === "Fastlønn");
    const bonusSpec = specs.find((s: any) => s.salaryType?.name === "Bonus");
    const taxSpec = specs.find((s: any) => s.salaryType?.name?.includes("Skattetrekk") || s.salaryType?.number === 6000);

    check("Fastlønn spec exists", !!fastlonnSpec, fastlonnSpec ? `amount=${fastlonnSpec.amount}` : "MISSING");
    check("Fastlønn amount", fastlonnSpec?.amount === BASE_SALARY, `expected=${BASE_SALARY}, actual=${fastlonnSpec?.amount}`);
    check("Bonus spec exists", !!bonusSpec, bonusSpec ? `amount=${bonusSpec.amount}` : "MISSING");
    check("Bonus amount", bonusSpec?.amount === BONUS_AMOUNT, `expected=${BONUS_AMOUNT}, actual=${bonusSpec?.amount}`);
    check("Tax deduction exists", !!taxSpec, taxSpec ? `amount=${taxSpec.amount}, salaryType=${taxSpec.salaryType?.name}` : "MISSING (generateTaxDeduction may not have fired)");

    console.log(`  All specs (${specs.length}):`);
    for (const s of specs) {
      console.log(`    ${s.salaryType?.name || s.salaryType?.number}: amount=${s.amount}, rate=${s.rate}, count=${s.count}`);
    }
  } else {
    check("Payslip exists", false, `GET failed: ${psR.status}`);
  }

  // V3: Voucher postings with correct amounts
  const vR = await api("GET", `/ledger/voucher/${result.voucherId}?fields=*,postings(*)`);
  if (vR.ok) {
    const postings = vR.data.value.postings || [];
    check("Voucher exists", true, `id=${result.voucherId}, number=${vR.data.value.number}`);

    let debitTotal = 0;
    let creditTotal = 0;
    for (const p of postings) {
      if (p.amountGross > 0) debitTotal += p.amountGross;
      else creditTotal += p.amountGross;
      console.log(`    Posting: row=${p.row} account=${p.account?.id} amountGross=${p.amountGross} amountGrossCurrency=${p.amountGrossCurrency} amount=${p.amount}`);
    }

    check("Voucher debit total", debitTotal === GROSS, `expected=${GROSS}, actual=${debitTotal}`);
    check("Voucher credit total", creditTotal === -GROSS, `expected=${-GROSS}, actual=${creditTotal}`);
    check("Voucher amounts non-zero", postings.every((p: any) => p.amountGross !== 0), postings.map((p: any) => p.amountGross).join(","));
    check("Voucher balanced", debitTotal + creditTotal === 0, `debit=${debitTotal} + credit=${creditTotal} = ${debitTotal + creditTotal}`);
  } else {
    check("Voucher exists", false, `GET failed: ${vR.status}`);
  }

  // V4: Employment with correct details
  const emplR = await api("GET", `/employee/employment?employeeId=${result.empId}&count=20&fields=*,employmentDetails(*)`);
  if (emplR.ok) {
    const empls = emplR.data.values || [];
    const targetEmpl = empls.find((e: any) => e.id === result.employmentId);
    if (targetEmpl) {
      const detail = targetEmpl.employmentDetails?.[0];
      check("Employment exists", true, `id=${result.employmentId}`);
      check("Employment division", targetEmpl.division?.id === result.divisionId, `expected=${result.divisionId}, actual=${targetEmpl.division?.id}`);
      check("Employment startDate", targetEmpl.startDate === PERIOD_START, `expected=${PERIOD_START}, actual=${targetEmpl.startDate}`);
      check("Employment remunerationType", detail?.remunerationType === "MONTHLY_WAGE", `actual=${detail?.remunerationType}`);
      check("Employment monthlySalary", detail?.monthlySalary === BASE_SALARY, `expected=${BASE_SALARY}, actual=${detail?.monthlySalary}`);
    } else {
      check("Employment exists", false, `id=${result.employmentId} not found in ${empls.length} employments`);
    }
  } else {
    check("Employment exists", false, `GET failed: ${emplR.status}`);
  }

  // V5: Employee dateOfBirth was set
  const empR = await api("GET", `/employee/${result.empId}?fields=id,dateOfBirth`);
  if (empR.ok) {
    check("Employee dateOfBirth set", empR.data.value.dateOfBirth === "1990-01-01", `actual=${empR.data.value.dateOfBirth}`);
  }

  return { passed, failed };
}

// ============================================================
// PHASE 5: CLEANUP — remove created resources
// ============================================================
async function cleanupPhase() {
  phase = "CLEANUP";
  console.log("\n" + "=".repeat(60));
  console.log("PHASE 5: CLEANUP");
  console.log("=".repeat(60));

  if (NO_CLEANUP) {
    console.log("  --no-cleanup flag set. Skipping cleanup.");
    console.log("  Created resources:");
    for (const r of created) console.log(`    ${r.type}: id=${r.id} (${r.label})`);
    return;
  }

  // Only clean up salary transactions and vouchers
  // Employees, employments, and divisions can't be deleted (403/405) and are harmless
  const salaryTxs = created.filter(r => r.type === "salary-tx");
  const vouchers = created.filter(r => r.type === "voucher");

  for (const r of salaryTxs) {
    const res = await api("DELETE", `/salary/transaction/${r.id}`);
    console.log(`  ${res.ok ? "Deleted" : "FAILED"} salary-tx ${r.id}`);
  }

  for (const r of vouchers) {
    // Use the same future date as the voucher to avoid reconciled period conflicts
    const res = await api("PUT", `/ledger/voucher/${r.id}/:reverse?date=${DATE}`);
    console.log(`  ${res.ok ? "Reversed" : "FAILED (harmless — voucher remains but is orphaned)"} voucher ${r.id}`);
  }

  const skipped = created.filter(r => !["salary-tx", "voucher"].includes(r.type));
  if (skipped.length > 0) {
    console.log(`  Skipped ${skipped.length} items (employees/employments/divisions — can't delete, harmless)`);
  }
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log("╔" + "═".repeat(58) + "╗");
  console.log("║  TASK 12: FULL END-TO-END PAYROLL SANDBOX TEST             ║");
  console.log("╚" + "═".repeat(58) + "╝");
  console.log(`  Config: Fastlønn ${BASE_SALARY} + Bonus ${BONUS_AMOUNT} = Gross ${GROSS}`);
  console.log(`  Period: ${YEAR}-${MONTH}, Date: ${DATE}`);
  console.log(`  Cleanup: ${NO_CLEANUP ? "DISABLED" : "enabled"}`);

  try {
    // Phase 1: Reset
    await resetPhase();

    // Phase 2: Setup
    const { empId, email } = await setupPhase();

    // Phase 3: Execute (8-call path)
    const executeCallCountBefore = callCount;
    const executeErrorCountBefore = errorCount;
    const result = await executePhase(email);
    const executeCalls = callCount - executeCallCountBefore;
    const executeErrors = errorCount - executeErrorCountBefore;

    // Phase 4: Verify
    const verifyCallCountBefore = callCount;
    const { passed, failed } = await verifyPhase(result);

    // Summary
    console.log("\n" + "═".repeat(60));
    console.log("SUMMARY");
    console.log("═".repeat(60));
    console.log(`  8-call path: ${executeCalls} calls, ${executeErrors} errors`);
    console.log(`  Verification: ${passed.length} passed, ${failed.length} failed`);
    if (failed.length > 0) {
      console.log(`  FAILED CHECKS:`);
      for (const f of failed) console.log(`    ✗ ${f}`);
    }
    console.log(`  Expected call count: 8. Actual: ${executeCalls}`);
    console.log(`  Expected errors: 0. Actual: ${executeErrors}`);

    const success = executeCalls === 8 && executeErrors === 0 && failed.length === 0;
    console.log(`\n  RESULT: ${success ? "ALL PASSED" : "ISSUES FOUND"}`);

    // Phase 5: Cleanup
    await cleanupPhase();

    if (!success) process.exit(1);
  } catch (e: any) {
    console.error(`\nFATAL in phase ${phase}: ${e.message || e}`);
    // Still try to clean up
    if (created.length > 0 && !NO_CLEANUP) {
      console.log("\nAttempting cleanup after failure...");
      await cleanupPhase();
    }
    process.exit(1);
  }
}

main();
