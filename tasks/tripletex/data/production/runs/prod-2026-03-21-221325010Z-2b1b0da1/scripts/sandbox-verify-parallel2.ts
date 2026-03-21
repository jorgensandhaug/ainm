/**
 * Sandbox verification: test parallelization optimizations.
 * Test 1: Can employment/details + 3 reads run in parallel?
 * Test 2: Can salary/transaction + voucher run in parallel?
 * Uses existing sandbox infrastructure.
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const BASE_SALARY = 58650;
const BONUS = 8850;
const GROSS = BASE_SALARY + BONUS;

let callCount = 0;

async function api(method: string, path: string, body?: any) {
  callCount++;
  const url = `${BASE}${path}`;
  console.log(`[${callCount}] ${method} ${url}`);
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) {
    console.error(`  ERROR ${r.status}:`, JSON.stringify(data).slice(0, 500));
    return { _error: true, status: r.status, data };
  }
  console.log(`  OK ${r.status}`);
  return data;
}

function generateOrgNumber(): string {
  while (true) {
    const digits = [9];
    for (let i = 0; i < 7; i++) digits.push(Math.floor(Math.random() * 10));
    const weights = [3, 2, 7, 6, 5, 4, 3, 2];
    const sum = digits.reduce((s, d, i) => s + d * weights[i], 0);
    const remainder = 11 - (sum % 11);
    if (remainder === 10) continue;
    const check = remainder === 11 ? 0 : remainder;
    digits.push(check);
    return digits.join("");
  }
}

async function main() {
  // Find an existing employee with email pattern from previous sandbox tests
  // Or find one that's payroll-ready
  console.log("=== Finding existing employees ===");
  const empRes = await api("GET", "/employee?count=10&fields=*");
  const employees = (empRes.values || []).filter((e: any) => e.email);

  // Pick one with dateOfBirth and active employment
  let empId: number | null = null;
  let empEmail: string | null = null;
  let needRepair = false;

  for (const e of employees) {
    console.log(`  id=${e.id} email=${e.email} dob=${e.dateOfBirth} empl=${e.employments?.length || 0}`);
    if (e.dateOfBirth && e.employments?.length > 0) {
      empId = e.id;
      empEmail = e.email;
      break;
    }
  }

  if (!empId) {
    // Find underconfigured employee
    for (const e of employees) {
      if (e.dateOfBirth === null && (!e.employments || e.employments.length === 0)) {
        empId = e.id;
        empEmail = e.email;
        needRepair = true;
        break;
      }
    }
  }

  if (!empId) {
    console.log("  No suitable employee found. Using first employee.");
    empId = employees[0].id;
    empEmail = employees[0].email;
  }

  console.log(`\n  Selected employee id=${empId} email=${empEmail} needRepair=${needRepair}`);

  if (needRepair) {
    // Get division
    const divRes = await api("GET", "/division?count=1&fields=*");
    const divisions = divRes.values || [];
    let divisionId: number;

    if (divisions.length === 0) {
      const orgNum = generateOrgNumber();
      const divCreateRes = await api("POST", "/division", {
        name: "Hovudavdeling",
        organizationNumber: orgNum,
        startDate: "2026-01-01",
        municipalityDate: "2026-01-01",
        municipality: { id: 1 }
      });
      divisionId = divCreateRes.value.id;
    } else {
      divisionId = divisions[0].id;
    }

    // Repair
    await api("PUT", `/employee/${empId}`, {
      id: empId,
      firstName: "Test",
      lastName: "Employee",
      email: empEmail,
      dateOfBirth: "1990-01-01"
    });

    const emplRes = await api("POST", "/employee/employment", {
      employee: { id: empId },
      division: { id: divisionId },
      startDate: "2026-03-01",
      isMainEmployer: true,
      taxDeductionCode: "loennFraHovedarbeidsgiver"
    });
    const employmentId = emplRes.value.id;

    // === KEY TEST 1: Parallel employment/details + reads ===
    console.log("\n=== TEST 1: Parallel POST employment/details + 3 reads ===");
    const t1 = performance.now();
    const [detailsRes, stRes, vtRes, acRes] = await Promise.all([
      api("POST", "/employee/employment/details", {
        employment: { id: employmentId },
        date: "2026-03-01",
        employmentType: "ORDINARY",
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 100,
        monthlySalary: BASE_SALARY,
        annualSalary: BASE_SALARY * 12
      }),
      api("GET", "/salary/type?count=1000&fields=*"),
      api("GET", "/ledger/voucherType?name=L%C3%B8nnsbilag&count=1&fields=*"),
      api("GET", "/ledger/account?number=5000,1920&count=10&fields=*")
    ]);
    console.log(`  Parallel step: ${(performance.now() - t1).toFixed(0)}ms`);
    console.log(`  employment/details: ${(detailsRes as any)._error ? 'FAILED' : 'OK'}`);

    const salaryTypes = stRes.values || [];
    const fastlonn = salaryTypes.find((t: any) => t.name === "Fastlønn");
    const bonus = salaryTypes.find((t: any) => t.name === "Bonus");
    const lonnsbilagId = vtRes.values?.[0]?.id;
    const acc5000 = acRes.values?.find((a: any) => a.number === 5000);
    const acc1920 = acRes.values?.find((a: any) => a.number === 1920);
    console.log(`  Fastlønn=${fastlonn?.id} Bonus=${bonus?.id} Lønnsbilag=${lonnsbilagId} 5000=${acc5000?.id} 1920=${acc1920?.id}`);

    // === KEY TEST 2: Parallel salary/transaction + voucher ===
    console.log("\n=== TEST 2: Parallel POST salary/transaction + POST voucher ===");
    const t2 = performance.now();
    const [txRes, vouRes] = await Promise.all([
      api("POST", "/salary/transaction?generateTaxDeduction=true", {
        date: "2026-03-01",
        year: 2026,
        month: 3,
        paySlipsAvailableDate: "2026-03-01",
        payslips: [{
          employee: { id: empId },
          date: "2026-03-01",
          year: 2026,
          month: 3,
          specifications: [
            { employee: { id: empId }, salaryType: { id: fastlonn.id }, description: "Fastlønn", year: 2026, month: 3, count: 1, rate: BASE_SALARY, amount: BASE_SALARY },
            { employee: { id: empId }, salaryType: { id: bonus.id }, description: "Bonus", year: 2026, month: 3, count: 1, rate: BONUS, amount: BONUS }
          ]
        }]
      }),
      api("POST", "/ledger/voucher?sendToLedger=true", {
        date: "2026-03-01",
        description: `Lønn mars 2026 - Fastlønn ${BASE_SALARY} + Bonus ${BONUS}`,
        voucherType: { id: lonnsbilagId },
        postings: [
          { row: 1, date: "2026-03-01", description: `Fastlønn ${BASE_SALARY}`, account: { id: acc5000.id }, amount: BASE_SALARY, amountCurrency: BASE_SALARY, amountGross: BASE_SALARY, amountGrossCurrency: BASE_SALARY },
          { row: 2, date: "2026-03-01", description: `Bonus ${BONUS}`, account: { id: acc5000.id }, amount: BONUS, amountCurrency: BONUS, amountGross: BONUS, amountGrossCurrency: BONUS },
          { row: 3, date: "2026-03-01", description: `Utbetaling`, account: { id: acc1920.id }, amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS }
        ]
      })
    ]);
    console.log(`  Parallel writes: ${(performance.now() - t2).toFixed(0)}ms`);
    console.log(`  salary/transaction: ${(txRes as any)._error ? 'FAILED' : 'OK id=' + txRes.value?.id}`);
    console.log(`  voucher: ${(vouRes as any)._error ? 'FAILED' : 'OK id=' + vouRes.value?.id + ' number=' + vouRes.value?.number}`);

    // Verify payslip
    if (!(txRes as any)._error) {
      const txId = txRes.value.id;
      const txDetail = await api("GET", `/salary/transaction/${txId}?fields=*`);
      const payslipId = txDetail.value?.payslips?.[0]?.id;
      if (payslipId) {
        const payslip = await api("GET", `/salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`);
        console.log(`\n  VERIFICATION: grossAmount=${payslip.value?.grossAmount}`);
        const specs = payslip.value?.specifications || [];
        for (const s of specs) {
          console.log(`    ${s.salaryType?.name}: amount=${s.amount} rate=${s.rate}`);
        }
      }
    }
  } else {
    // Employee is payroll-ready, just test parallel reads
    console.log("\n=== Employee is payroll-ready, testing parallel reads ===");
    const t1 = performance.now();
    const [stRes, vtRes, acRes] = await Promise.all([
      api("GET", "/salary/type?count=1000&fields=*"),
      api("GET", "/ledger/voucherType?name=L%C3%B8nnsbilag&count=1&fields=*"),
      api("GET", "/ledger/account?number=5000,1920&count=10&fields=*")
    ]);
    console.log(`  Parallel reads: ${(performance.now() - t1).toFixed(0)}ms`);

    const salaryTypes = stRes.values || [];
    const fastlonn = salaryTypes.find((t: any) => t.name === "Fastlønn");
    const bonus = salaryTypes.find((t: any) => t.name === "Bonus");
    const lonnsbilagId = vtRes.values?.[0]?.id;
    const acc5000 = acRes.values?.find((a: any) => a.number === 5000);
    const acc1920 = acRes.values?.find((a: any) => a.number === 1920);
    console.log(`  Fastlønn=${fastlonn?.id} Bonus=${bonus?.id} Lønnsbilag=${lonnsbilagId} 5000=${acc5000?.id} 1920=${acc1920?.id}`);

    // Payroll test - use month 6 to avoid conflicts
    console.log("\n=== Testing parallel salary/transaction + voucher ===");
    const t2 = performance.now();
    const [txRes, vouRes] = await Promise.all([
      api("POST", "/salary/transaction?generateTaxDeduction=true", {
        date: "2026-06-01",
        year: 2026,
        month: 6,
        paySlipsAvailableDate: "2026-06-01",
        payslips: [{
          employee: { id: empId },
          date: "2026-06-01",
          year: 2026,
          month: 6,
          specifications: [
            { employee: { id: empId }, salaryType: { id: fastlonn.id }, description: "Fastlønn", year: 2026, month: 6, count: 1, rate: BASE_SALARY, amount: BASE_SALARY },
            { employee: { id: empId }, salaryType: { id: bonus.id }, description: "Bonus", year: 2026, month: 6, count: 1, rate: BONUS, amount: BONUS }
          ]
        }]
      }),
      api("POST", "/ledger/voucher?sendToLedger=true", {
        date: "2026-06-01",
        description: `Lønn juni 2026 - Fastlønn ${BASE_SALARY} + Bonus ${BONUS}`,
        voucherType: { id: lonnsbilagId },
        postings: [
          { row: 1, date: "2026-06-01", description: `Fastlønn ${BASE_SALARY}`, account: { id: acc5000.id }, amount: BASE_SALARY, amountCurrency: BASE_SALARY, amountGross: BASE_SALARY, amountGrossCurrency: BASE_SALARY },
          { row: 2, date: "2026-06-01", description: `Bonus ${BONUS}`, account: { id: acc5000.id }, amount: BONUS, amountCurrency: BONUS, amountGross: BONUS, amountGrossCurrency: BONUS },
          { row: 3, date: "2026-06-01", description: `Utbetaling`, account: { id: acc1920.id }, amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS }
        ]
      })
    ]);
    console.log(`  Parallel writes: ${(performance.now() - t2).toFixed(0)}ms`);
    console.log(`  salary/transaction: ${(txRes as any)._error ? 'FAILED - ' + JSON.stringify((txRes as any).data).slice(0,300) : 'OK id=' + txRes.value?.id}`);
    console.log(`  voucher: ${(vouRes as any)._error ? 'FAILED - ' + JSON.stringify((vouRes as any).data).slice(0,300) : 'OK id=' + vouRes.value?.id}`);

    // Verify payslip
    if (!(txRes as any)._error) {
      const txId = txRes.value.id;
      const txDetail = await api("GET", `/salary/transaction/${txId}?fields=*`);
      const payslipId = txDetail.value?.payslips?.[0]?.id;
      if (payslipId) {
        const payslip = await api("GET", `/salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`);
        console.log(`\n  VERIFICATION: grossAmount=${payslip.value?.grossAmount}`);
        const specs = payslip.value?.specifications || [];
        for (const s of specs) {
          console.log(`    ${s.salaryType?.name}: amount=${s.amount} rate=${s.rate}`);
        }
      }
    }
  }

  console.log(`\nTotal calls: ${callCount}`);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
