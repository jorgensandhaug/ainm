// Task 12: Optimized path where GETs don't count toward score
// Only writes (POST/PUT/DELETE) affect efficiency
// Strategy: use GETs liberally for lookups + verification + logging
//
// Write count: 5 (POST division, PUT employee, POST employment, POST salary/tx, POST voucher)
// GET count: unlimited (free)
//
// Usage: bun sandbox-investigation/133-task12-gets-free.ts [--no-cleanup]

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const YEAR = 2027;
const MONTH = 10;
const DATE = `${YEAR}-10-15`;
const PERIOD_START = `${YEAR}-10-01`;
const BASE_SALARY = 45200;
const BONUS_AMOUNT = 12300;
const GROSS = BASE_SALARY + BONUS_AMOUNT;

const NO_CLEANUP = Bun.argv.includes("--no-cleanup");

let writeCount = 0;
let getCount = 0;
let errorCount = 0;

async function api(method: string, path: string, body?: any): Promise<{ ok: boolean; status: number; data: any }> {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);

  const isWrite = method !== "GET";
  if (isWrite) writeCount++;
  else getCount++;

  const tag = isWrite ? `WRITE#${writeCount}` : `GET#${getCount}`;
  console.log(`  [${tag}] ${method} ${path}`);

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

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║  TASK 12: OPTIMIZED — GETs FREE, ONLY WRITES COUNT       ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log(`  Fastlønn ${BASE_SALARY} + Bonus ${BONUS_AMOUNT} = Gross ${GROSS}`);
  console.log(`  Period: ${YEAR}-${MONTH}, Date: ${DATE}`);

  // ============================================================
  // SETUP: create underconfigured test employee
  // ============================================================
  console.log("\n--- SETUP (not counted) ---");
  const deptR = await api("GET", "/department?count=1&fields=id");
  const email = `t12-getsfree-${Date.now()}@example.org`;
  const empCreate = await api("POST", "/employee", {
    firstName: "GetsFree", lastName: `R${Date.now() % 100000}`,
    email, userType: "STANDARD", allowInformationRegistration: true,
    department: { id: deptR.data.values[0].id },
  });
  const setupEmpId = empCreate.data.value.id;
  console.log(`  Employee: id=${setupEmpId}, email=${email}`);

  // Reset counters — real path starts here
  writeCount = 0;
  getCount = 0;
  errorCount = 0;

  // ============================================================
  // PHASE 1: READS (all free — do as many as useful)
  // ============================================================
  console.log("\n═══ PHASE 1: PARALLEL READS (free) ═══");
  const [empR, stR, accR, vtR] = await Promise.all([
    api("GET", `/employee?email=${encodeURIComponent(email)}&count=10&fields=*`),
    api("GET", "/salary/type?count=1000&fields=id,name,number"),
    api("GET", "/ledger/account?number=5000,1920&count=10&fields=id,number,name"),
    api("GET", "/ledger/voucherType?name=Lønnsbilag&count=1&fields=id,name"),
  ]);

  // Resolve + log employee
  const emp = (empR.data.values || []).find((e: any) => e.email === email);
  if (!emp) throw new Error(`Employee not found: ${email}`);
  console.log(`  → Employee: id=${emp.id}, name="${emp.firstName} ${emp.lastName}"`);
  console.log(`    dateOfBirth=${emp.dateOfBirth}, employments=${JSON.stringify(emp.employments || [])}`);

  // Resolve + log salary types
  const fastlonn = (stR.data.values || []).find((t: any) => t.name === "Fastlønn");
  const bonus = (stR.data.values || []).find((t: any) => t.name === "Bonus");
  if (!fastlonn || !bonus) throw new Error("Missing salary types");
  console.log(`  → Fastlønn: id=${fastlonn.id}, number=${fastlonn.number}`);
  console.log(`  → Bonus: id=${bonus.id}, number=${bonus.number}`);

  // Resolve + log accounts
  const acc5000 = (accR.data.values || []).find((a: any) => a.number === 5000);
  const acc1920 = (accR.data.values || []).find((a: any) => a.number === 1920);
  if (!acc5000 || !acc1920) throw new Error("Missing accounts");
  console.log(`  → Account 5000: id=${acc5000.id} (${acc5000.name})`);
  console.log(`  → Account 1920: id=${acc1920.id} (${acc1920.name})`);

  // Resolve + log voucherType (free GET, so we get the real id)
  const lbType = vtR.data.values?.[0];
  if (!lbType) throw new Error("Lønnsbilag voucherType not found");
  console.log(`  → VoucherType Lønnsbilag: id=${lbType.id}, name="${lbType.name}"`);

  // ============================================================
  // PHASE 2: REPAIRS (2 writes, parallel)
  // ============================================================
  console.log("\n═══ PHASE 2: REPAIRS — POST /division + PUT /employee (2 writes) ═══");
  const orgNum = generateOrgNumber();
  const [divR, putR] = await Promise.all([
    api("POST", "/division", {
      name: "Hovudavdeling",
      organizationNumber: orgNum,
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
  if (!divR.ok) throw new Error(`Division failed: ${JSON.stringify(divR.data)}`);
  if (!putR.ok) throw new Error(`PUT employee failed: ${JSON.stringify(putR.data)}`);
  const divisionId = divR.data.value.id;
  console.log(`  → Division: id=${divisionId}, orgNumber=${orgNum}`);
  console.log(`  → Employee dateOfBirth repaired: ${putR.data.value.dateOfBirth}`);

  // Verify repairs with free GETs (division has no GET-by-id endpoint)
  console.log("\n  --- Verify repairs (free GETs) ---");
  const empVerify = await api("GET", `/employee/${emp.id}?fields=id,firstName,lastName,dateOfBirth`);
  console.log(`  → Employee verified: dateOfBirth=${empVerify.data.value.dateOfBirth}`);

  // ============================================================
  // PHASE 3: EMPLOYMENT (1 write)
  // ============================================================
  console.log("\n═══ PHASE 3: POST /employee/employment with inline details (1 write) ═══");
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
  if (!emplR.ok) throw new Error(`Employment failed: ${JSON.stringify(emplR.data)}`);
  const employmentId = emplR.data.value.id;
  console.log(`  → Employment: id=${employmentId}`);

  // Verify employment with free GET
  console.log("\n  --- Verify employment (free GET) ---");
  const emplVerify = await api("GET", `/employee/employment/${employmentId}?fields=*,employmentDetails(*)`);
  if (emplVerify.ok) {
    const empl = emplVerify.data.value;
    const detail = empl.employmentDetails?.[0];
    console.log(`  → Employment verified: id=${empl.id}, division=${empl.division?.id}, startDate=${empl.startDate}`);
    console.log(`    isMainEmployer=${empl.isMainEmployer}, taxDeductionCode=${empl.taxDeductionCode}`);
    console.log(`    remunerationType=${detail?.remunerationType}, monthlySalary=${detail?.monthlySalary}, annualSalary=${detail?.annualSalary}`);
  }

  // ============================================================
  // PHASE 4: WRITES — salary tx + voucher (2 writes, parallel)
  // ============================================================
  console.log("\n═══ PHASE 4: POST /salary/transaction + POST /ledger/voucher (2 writes) ═══");
  const [txR, vR] = await Promise.all([
    api("POST", "/salary/transaction?generateTaxDeduction=true", {
      date: DATE, year: YEAR, month: MONTH, paySlipsAvailableDate: DATE,
      payslips: [{
        employee: { id: emp.id }, date: DATE, year: YEAR, month: MONTH,
        specifications: [
          { employee: { id: emp.id }, salaryType: { id: fastlonn.id }, description: `Fastlønn ${MONTH}/${YEAR}`, year: YEAR, month: MONTH, count: 1, rate: BASE_SALARY, amount: BASE_SALARY },
          { employee: { id: emp.id }, salaryType: { id: bonus.id }, description: `Bonus ${MONTH}/${YEAR}`, year: YEAR, month: MONTH, count: 1, rate: BONUS_AMOUNT, amount: BONUS_AMOUNT },
        ],
      }],
    }),
    api("POST", "/ledger/voucher?sendToLedger=true", {
      voucherType: { id: lbType.id },  // Use id since GET is free
      date: DATE,
      description: `Lønn ${MONTH}/${YEAR} - Fastlønn ${BASE_SALARY} + Bonus ${BONUS_AMOUNT}`,
      postings: [
        { account: { id: acc5000.id }, description: `Fastlønn ${MONTH}/${YEAR}`, amountGross: BASE_SALARY, amountGrossCurrency: BASE_SALARY, row: 1 },
        { account: { id: acc5000.id }, description: `Bonus ${MONTH}/${YEAR}`, amountGross: BONUS_AMOUNT, amountGrossCurrency: BONUS_AMOUNT, row: 2 },
        { account: { id: acc1920.id }, description: `Lønn ${MONTH}/${YEAR}`, amountGross: -GROSS, amountGrossCurrency: -GROSS, row: 3 },
      ],
    }),
  ]);
  if (!txR.ok) throw new Error(`Salary tx failed: ${JSON.stringify(txR.data)}`);
  if (!vR.ok) throw new Error(`Voucher failed: ${JSON.stringify(vR.data)}`);

  const txId = txR.data.value.id;
  const payslipId = txR.data.value.payslips?.[0]?.id;
  const voucherId = vR.data.value.id;
  console.log(`  → Salary tx: id=${txId}`);
  console.log(`  → Payslip: id=${payslipId}`);
  console.log(`  → Voucher: id=${voucherId}, number=${vR.data.value.number}`);

  // ============================================================
  // PHASE 5: VERIFICATION (all free GETs — log everything)
  // ============================================================
  console.log("\n═══ PHASE 5: VERIFICATION (free GETs) ═══");

  // Parallel verification reads
  const [psR, vVerify, txVerify] = await Promise.all([
    api("GET", `/salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`),
    api("GET", `/ledger/voucher/${voucherId}?fields=*,postings(*,account(id,number,name)),voucherType(id,name)`),
    api("GET", `/salary/transaction/${txId}?fields=*`),
  ]);

  // Log payslip details
  const passed: string[] = [];
  const failed: string[] = [];
  function check(name: string, ok: boolean, detail: string) {
    if (ok) { passed.push(name); console.log(`  ✓ ${name}: ${detail}`); }
    else { failed.push(name); console.log(`  ✗ ${name}: ${detail}`); }
  }

  if (psR.ok) {
    const ps = psR.data.value;
    check("Payslip exists", true, `id=${payslipId}`);
    check("Payslip grossAmount", ps.grossAmount === GROSS, `expected=${GROSS}, actual=${ps.grossAmount}`);
    check("Payslip net > 0", ps.amount > 0, `net=${ps.amount} (after tax deduction)`);
    // Payslip number=0 is expected — numbers assigned only on payroll finalization, not creation
    console.log(`  ℹ Payslip number: ${ps.number} (0=draft, expected for unfinalized tx)`);

    const specs = ps.specifications || [];
    const fSpec = specs.find((s: any) => s.salaryType?.name === "Fastlønn");
    const bSpec = specs.find((s: any) => s.salaryType?.name === "Bonus");
    const tSpec = specs.find((s: any) => s.salaryType?.name?.includes("Skattetrekk"));

    check("Fastlønn spec", fSpec?.amount === BASE_SALARY, `expected=${BASE_SALARY}, actual=${fSpec?.amount}`);
    check("Bonus spec", bSpec?.amount === BONUS_AMOUNT, `expected=${BONUS_AMOUNT}, actual=${bSpec?.amount}`);
    check("Skattetrekk exists", !!tSpec, tSpec ? `amount=${tSpec.amount}` : "MISSING");
    check("Skattetrekk negative", tSpec ? tSpec.amount < 0 : false, `amount=${tSpec?.amount}`);
    check("Spec count", specs.length === 3, `expected=3 (Fastlønn+Bonus+Skattetrekk), actual=${specs.length}`);

    console.log(`\n  Payslip summary:`);
    console.log(`    gross=${ps.grossAmount}, net=${ps.amount}, number=${ps.number}`);
    for (const s of specs) {
      console.log(`    ${s.salaryType?.name} (id=${s.salaryType?.id}): amount=${s.amount}, rate=${s.rate}, count=${s.count}`);
    }
  }

  // Log voucher details
  if (vVerify.ok) {
    const v = vVerify.data.value;
    const postings = v.postings || [];
    check("Voucher exists", true, `id=${voucherId}, number=${v.number}`);
    check("VoucherType Lønnsbilag", v.voucherType?.name === "Lønnsbilag", `type=${JSON.stringify(v.voucherType)}`);

    let debit = 0, credit = 0;
    for (const p of postings) {
      if (p.amountGross > 0) debit += p.amountGross;
      else credit += p.amountGross;
    }
    check("Voucher debit", debit === GROSS, `expected=${GROSS}, actual=${debit}`);
    check("Voucher credit", credit === -GROSS, `expected=${-GROSS}, actual=${credit}`);
    check("Voucher balanced", debit + credit === 0, `sum=${debit + credit}`);
    check("Voucher amounts non-zero", postings.every((p: any) => p.amountGross !== 0), "all non-zero");

    console.log(`\n  Voucher summary:`);
    console.log(`    id=${v.id}, number=${v.number}, date=${v.date}`);
    console.log(`    voucherType=${v.voucherType?.name} (id=${v.voucherType?.id})`);
    console.log(`    description="${v.description}"`);
    for (const p of postings) {
      console.log(`    row=${p.row} ${p.account?.number} ${p.account?.name}: amountGross=${p.amountGross}`);
    }
  }

  // Log salary transaction state
  if (txVerify.ok) {
    const tx = txVerify.data.value;
    console.log(`\n  Salary transaction summary:`);
    console.log(`    id=${tx.id}, date=${tx.date}, year=${tx.year}, month=${tx.month}`);
    console.log(`    calculation=${tx.calculation}, compilation=${tx.compilation}`);
    console.log(`    payslips: ${tx.payslips?.length}`);
  }

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log("\n" + "═".repeat(60));
  console.log("SUMMARY");
  console.log("═".repeat(60));
  console.log(`  Writes (counted for score): ${writeCount}`);
  console.log(`  GETs (free, not counted):   ${getCount}`);
  console.log(`  Errors:                     ${errorCount}`);
  console.log(`  Verification: ${passed.length} passed, ${failed.length} failed`);
  if (failed.length > 0) {
    console.log(`  FAILED CHECKS:`);
    for (const f of failed) console.log(`    ✗ ${f}`);
  }

  const success = writeCount === 5 && errorCount === 0 && failed.length === 0;
  console.log(`\n  Expected writes: 5. Actual: ${writeCount}`);
  console.log(`  RESULT: ${success ? "ALL PASSED" : "ISSUES FOUND"}`);

  // ============================================================
  // CLEANUP
  // ============================================================
  if (!NO_CLEANUP) {
    console.log("\n--- CLEANUP ---");
    await api("DELETE", `/salary/transaction/${txId}`);
    await api("PUT", `/ledger/voucher/${voucherId}/:reverse?date=${DATE}`);
    console.log("  Done (employees/employments/divisions can't be deleted, harmless).");
  } else {
    console.log("\n--- CLEANUP SKIPPED (--no-cleanup) ---");
    console.log(`  salary-tx: ${txId}, voucher: ${voucherId}`);
  }

  if (!success) process.exit(1);
}

main().catch(e => { console.error(`FATAL: ${e.message || e}`); process.exit(1); });
