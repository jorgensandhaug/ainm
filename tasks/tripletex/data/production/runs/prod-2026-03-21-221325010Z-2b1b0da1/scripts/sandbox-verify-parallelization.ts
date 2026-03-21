/**
 * Sandbox verification: test whether employment/details can be parallelized with
 * the 3 reads (salary/type + voucherType + accounts) to save wall-clock time.
 * Also verify the final payslip state.
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const BASE_SALARY = 58650;
const BONUS = 8850;
const GROSS = BASE_SALARY + BONUS; // 67500

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
    return { error: true, status: r.status, data };
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
  const ts = Date.now();
  const email = `sandbox-payroll-parallel-${ts}@example.org`;

  // Step 1: Create a disposable underconfigured employee
  console.log("=== Creating disposable employee ===");
  const empRes = await api("POST", "/employee", {
    firstName: "TestParallel",
    lastName: "Employee",
    email
  });
  const empId = empRes.value.id;
  console.log(`  Employee id=${empId}, email=${email}`);

  // Step 2: Check division
  const divRes = await api("GET", "/division?count=1&fields=*");
  const divisions = divRes.values || [];
  let divisionId: number;

  if (divisions.length === 0) {
    console.log("  No division, creating one");
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
    console.log(`  Using existing division id=${divisionId}`);
  }

  // Step 3: Set dateOfBirth
  await api("PUT", `/employee/${empId}`, {
    id: empId,
    firstName: "TestParallel",
    lastName: "Employee",
    email,
    dateOfBirth: "1990-01-01"
  });

  // Step 4: Create employment
  const emplRes = await api("POST", "/employee/employment", {
    employee: { id: empId },
    division: { id: divisionId },
    startDate: "2026-03-01",
    isMainEmployer: true,
    taxDeductionCode: "loennFraHovedarbeidsgiver"
  });
  const employmentId = emplRes.value.id;
  console.log(`  Employment id=${employmentId}`);

  // === KEY TEST: parallelize employment/details with the 3 reads ===
  console.log("\n=== Testing parallel employment/details + reads ===");
  const startTime = performance.now();

  const [detailsRes, salaryTypeRes, voucherTypeRes, accountRes] = await Promise.all([
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

  const parallelTime = performance.now() - startTime;
  console.log(`\n  Parallel step took ${parallelTime.toFixed(0)}ms`);

  // Check if any failed
  if ((detailsRes as any).error) {
    console.error("  employment/details FAILED in parallel — this optimization is NOT safe");
    return;
  }
  console.log("  employment/details succeeded in parallel with reads ✓");

  // Parse results
  const salaryTypes = salaryTypeRes.values || [];
  const fastlonn = salaryTypes.find((t: any) => t.name === "Fastlønn");
  const bonus = salaryTypes.find((t: any) => t.name === "Bonus");
  console.log(`  Fastlønn id=${fastlonn?.id}, Bonus id=${bonus?.id}`);

  const voucherTypes = voucherTypeRes.values || [];
  const lonnsbilagId = voucherTypes[0]?.id;
  console.log(`  Lønnsbilag voucherType id=${lonnsbilagId}`);

  const accounts = accountRes.values || [];
  const acc5000 = accounts.find((a: any) => a.number === 5000);
  const acc1920 = accounts.find((a: any) => a.number === 1920);
  console.log(`  Account 5000 id=${acc5000?.id}, Account 1920 id=${acc1920?.id}`);

  // === Test: can salary transaction + voucher be parallelized? ===
  console.log("\n=== Testing parallel salary transaction + voucher ===");
  const startTime2 = performance.now();

  const [txRes, voucherRes] = await Promise.all([
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
          {
            employee: { id: empId },
            salaryType: { id: fastlonn.id },
            description: "Fastlønn",
            year: 2026,
            month: 3,
            count: 1,
            rate: BASE_SALARY,
            amount: BASE_SALARY
          },
          {
            employee: { id: empId },
            salaryType: { id: bonus.id },
            description: "Bonus",
            year: 2026,
            month: 3,
            count: 1,
            rate: BONUS,
            amount: BONUS
          }
        ]
      }]
    }),
    api("POST", "/ledger/voucher?sendToLedger=true", {
      date: "2026-03-01",
      description: `Lønn mars 2026 - Fastlønn ${BASE_SALARY} + Bonus ${BONUS}`,
      voucherType: { id: lonnsbilagId },
      postings: [
        {
          row: 1,
          date: "2026-03-01",
          description: `Fastlønn ${BASE_SALARY}`,
          account: { id: acc5000.id },
          amount: BASE_SALARY,
          amountCurrency: BASE_SALARY,
          amountGross: BASE_SALARY,
          amountGrossCurrency: BASE_SALARY
        },
        {
          row: 2,
          date: "2026-03-01",
          description: `Bonus ${BONUS}`,
          account: { id: acc5000.id },
          amount: BONUS,
          amountCurrency: BONUS,
          amountGross: BONUS,
          amountGrossCurrency: BONUS
        },
        {
          row: 3,
          date: "2026-03-01",
          description: `Utbetaling lønn mars 2026`,
          account: { id: acc1920.id },
          amount: -GROSS,
          amountCurrency: -GROSS,
          amountGross: -GROSS,
          amountGrossCurrency: -GROSS
        }
      ]
    })
  ]);

  const parallelTime2 = performance.now() - startTime2;
  console.log(`\n  Parallel writes took ${parallelTime2.toFixed(0)}ms`);

  if ((txRes as any).error) {
    console.error("  salary/transaction FAILED in parallel");
  } else {
    console.log(`  salary/transaction succeeded: id=${txRes.value?.id} ✓`);
  }
  if ((voucherRes as any).error) {
    console.error("  voucher FAILED in parallel");
  } else {
    console.log(`  voucher succeeded: id=${voucherRes.value?.id}, number=${voucherRes.value?.number} ✓`);
  }

  // === Verify final payslip state ===
  console.log("\n=== Verifying payslip state ===");
  if (!(txRes as any).error) {
    const txId = txRes.value.id;
    const txDetail = await api("GET", `/salary/transaction/${txId}?fields=*`);
    const payslipId = txDetail.value?.payslips?.[0]?.id;
    if (payslipId) {
      const payslip = await api("GET", `/salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`);
      console.log(`  grossAmount=${payslip.value?.grossAmount}`);
      console.log(`  amount=${payslip.value?.amount}`);
      const specs = payslip.value?.specifications || [];
      for (const s of specs) {
        console.log(`  spec: ${s.salaryType?.name} amount=${s.amount} rate=${s.rate} count=${s.count}`);
      }
    }
  }

  console.log(`\nTotal calls: ${callCount}`);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
