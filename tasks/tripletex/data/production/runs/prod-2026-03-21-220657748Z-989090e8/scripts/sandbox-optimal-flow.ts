// Test the fully optimized flow:
// 1. inline employmentDetails (saves 1 call)
// 2. parallelize repair chain with reads (wall-clock optimization)
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const YEAR = 2026; const MONTH = 3; const DATE = "2026-03-21"; const MONTH_START = "2026-03-01";
const BASE_SALARY = 36800; const BONUS_AMOUNT = 14100; const GROSS = BASE_SALARY + BONUS_AMOUNT;

let callCount = 0;
async function api(method: string, path: string, body?: any) {
  callCount++;
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`[${callCount}] ${method} ${path} → ${r.status}`);
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
  // ===== SETUP: Create disposable employee (sandbox-specific, not counted) =====
  const deptRes = await fetch(`${BASE}/department?count=1&fields=*`, { headers: { Authorization: AUTH } });
  const deptId = (await deptRes.json() as any).values?.[0]?.id;
  const testEmail = `payroll-optimal-${Date.now()}@example.org`;
  const setupRes = await fetch(`${BASE}/employee`, {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({ firstName: "TestOptimal", lastName: `O${Date.now()}`, email: testEmail, userType: "NO_ACCESS", department: { id: deptId } }),
  });
  const empData = (await setupRes.json() as any).value;
  const empId = empData.id;
  console.log(`\n=== SETUP DONE: employee id=${empId} ===\n`);

  // ===== START COUNTING: Simulating the exact production flow =====
  callCount = 0;
  const startMs = Date.now();

  // Step 1: GET employee (simulating email lookup)
  const empRes = await api("GET", `/employee?email=${testEmail}&count=10&fields=*`);
  const emp = empRes.data.values?.find((e: any) => e.email?.toLowerCase() === testEmail.toLowerCase());
  console.log(`  → underconfigured: dateOfBirth=${emp.dateOfBirth}, employments=${JSON.stringify(emp.employments)}`);

  // Step 2: GET division
  const divRes = await api("GET", "/division?count=1&fields=*");
  const divisions = divRes.data.values || [];
  let divisionId: number;

  if (divisions.length > 0) {
    divisionId = divisions[0].id;
    console.log(`  → existing division: id=${divisionId}`);
  } else {
    // Step 3: POST division (if needed)
    const orgNum = generateOrgNumber();
    const divCreateRes = await api("POST", "/division", {
      name: "Hovudavdeling", organizationNumber: orgNum,
      startDate: `${YEAR}-01-01`, municipalityDate: `${YEAR}-01-01`, municipality: { id: 1 },
    });
    divisionId = divCreateRes.data.value?.id;
    console.log(`  → created division: id=${divisionId}`);
  }

  // Steps 4-5 + 6-8: PARALLELIZE repair chain with 3 reads
  console.log("\n=== PARALLEL: repair chain + reads ===");
  const [employmentResult, salTypeRes, vtRes, accRes] = await Promise.all([
    // Chain A: PUT employee → POST employment with inline details (2 sequential calls)
    (async () => {
      await api("PUT", `/employee/${empId}`, { ...emp, dateOfBirth: "1990-01-01" });
      return api("POST", "/employee/employment", {
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
    })(),
    // Chain B: 3 independent reads (parallel)
    api("GET", "/salary/type?count=1000&fields=*"),
    api("GET", "/ledger/voucherType?name=L%C3%B8nnsbilag&count=1&fields=*"),
    api("GET", "/ledger/account?number=5000,1920&count=10&fields=*"),
  ]);

  const salTypes = salTypeRes.data.values || [];
  const fastlonn = salTypes.find((t: any) => t.name === "Fastlønn");
  const bonus = salTypes.find((t: any) => t.name === "Bonus");
  const voucherTypeId = vtRes.data.values?.[0]?.id;
  const acc5000 = accRes.data.values?.find((a: any) => a.number === 5000);
  const acc1920 = accRes.data.values?.find((a: any) => a.number === 1920);

  // Step 9: POST salary/transaction
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

  // Step 10: POST voucher (skipping due to sandbox reconciliation constraint — would succeed in fresh prod accounts)
  // const voucherRes = await api("POST", "/ledger/voucher?sendToLedger=true", { ... });

  const elapsedMs = Date.now() - startMs;
  console.log(`\n=== RESULTS ===`);
  console.log(`Total API calls: ${callCount}`);
  console.log(`Wall-clock: ${elapsedMs}ms`);
  console.log(`Transaction: id=${txRes.data.value?.id}`);

  // Verify payslip (not counted)
  const payslipId = txRes.data.value?.payslips?.[0]?.id;
  const psRes = await fetch(`${BASE}/salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`, { headers: { Authorization: AUTH } });
  const ps = (await psRes.json() as any).value;
  console.log(`\n=== PAYSLIP VERIFICATION (not counted) ===`);
  console.log(`grossAmount=${ps?.grossAmount}, amount=${ps?.amount}`);
  ps?.specifications?.forEach((s: any) => {
    console.log(`  ${s.salaryType?.name}: amount=${s.amount}`);
  });

  // Verify employment details (not counted)
  const emplId = employmentResult.data.value?.id;
  const detRes = await fetch(`${BASE}/employee/employment/details?employmentId=${emplId}&fields=*`, { headers: { Authorization: AUTH } });
  const dets = (await detRes.json() as any).values;
  console.log(`\n=== EMPLOYMENT DETAILS VERIFICATION (not counted) ===`);
  dets?.forEach((d: any) => {
    console.log(`  remunerationType=${d.remunerationType}, monthlySalary=${d.monthlySalary}`);
  });

  console.log(`\n=== OPTIMAL FLOW: ${callCount} calls + 1 voucher POST (skipped due to sandbox constraint) = ${callCount + 1} total for no-division branch ===`);
}

main().catch(e => console.error(e));
