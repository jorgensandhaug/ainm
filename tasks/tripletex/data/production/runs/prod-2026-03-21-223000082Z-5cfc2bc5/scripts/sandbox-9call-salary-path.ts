// Verify the optimized 9-call salary path with correct voucher amount fields
// 3 rounds of parallel execution
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + Buffer.from("0:" + TOKEN).toString("base64");
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const BASE_SALARY = 34950;
const BONUS_AMT = 15450;
const TOTAL = BASE_SALARY + BONUS_AMT;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const start = Date.now();
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${res.status} (${Date.now() - start}ms)`);
  if (res.status >= 400) console.log(JSON.stringify(json, null, 2));
  return { status: res.status, data: json };
}

function genOrgNumber(): string {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  const digits = [9];
  for (let i = 1; i < 8; i++) digits.push(Math.floor(Math.random() * 10));
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += digits[i] * weights[i];
  const remainder = sum % 11;
  if (remainder === 1) return genOrgNumber();
  const check = remainder === 0 ? 0 : 11 - remainder;
  digits.push(check);
  return digits.join("");
}

async function main() {
  // Create a test employee for this proof
  console.log("=== Setup: Create underconfigured test employee ===");
  const createEmpRes = await api("POST", "/employee", {
    firstName: "TestPayroll",
    lastName: "SandboxProof",
    email: `test-payroll-${Date.now()}@example.org`,
    dateOfBirth: null,
  });
  if (createEmpRes.status !== 201) { console.log("Failed to create test employee"); return; }
  const empId = createEmpRes.data.value.id;
  const emp = createEmpRes.data.value;
  console.log(`Created employee: id=${empId}`);

  console.log("\n=== Round 1: GET /employee (1 call) ===");
  // In production, this would be: GET /employee?email=...&count=10&fields=*
  // Here we already have the employee from creation. In real run, this is the first call.
  console.log(`Employee id=${empId}, dateOfBirth=null, underconfigured=true`);

  console.log("\n=== Round 2: POST /division || PUT /employee || 3 reads (5 parallel + 2 chained = 7 calls) ===");
  const round2Start = Date.now();

  let divId: number;
  let fastlonnId: number;
  let bonusId: number;
  let vtId: number;
  let a5000Id: number;
  let a2050Id: number;

  const [chainResult, putResult, stRes, vtRes, acRes] = await Promise.all([
    // Chain A: POST /division → POST /employment
    (async () => {
      const divRes = await api("POST", "/division", {
        name: "Hovudavdeling",
        organizationNumber: genOrgNumber(),
        startDate: "2026-01-01",
        municipalityDate: "2026-01-01",
        municipality: { id: 1 },
      });
      if (divRes.status !== 201) return { ok: false, err: "division" };
      divId = divRes.data.value.id;
      console.log(`  Division created: id=${divId}`);

      const emplRes = await api("POST", "/employee/employment", {
        employee: { id: empId },
        division: { id: divId },
        startDate: "2026-03-01",
        isMainEmployer: true,
        taxDeductionCode: "loennFraHovedarbeidsgiver",
        employmentDetails: [{
          date: "2026-03-01",
          employmentType: "ORDINARY",
          employmentForm: "PERMANENT",
          remunerationType: "MONTHLY_WAGE",
          workingHoursScheme: "NOT_SHIFT",
          percentageOfFullTimeEquivalent: 100,
          monthlySalary: BASE_SALARY,
          annualSalary: BASE_SALARY * 12,
        }],
      });
      return { ok: emplRes.status === 201, employmentId: emplRes.data.value?.id };
    })(),
    // PUT employee
    api("PUT", `/employee/${empId}`, {
      id: empId, firstName: emp.firstName, lastName: emp.lastName,
      email: emp.email, dateOfBirth: "1990-01-01",
    }),
    // 3 parallel reads
    api("GET", "/salary/type?count=1000&fields=*"),
    api("GET", "/ledger/voucherType?name=Lønnsbilag&count=1&fields=*"),
    api("GET", "/ledger/account?number=5000,2050&count=10&fields=*"),
  ]);

  console.log(`Round 2 total time: ${Date.now() - round2Start}ms`);

  if (!chainResult.ok) { console.log("BLOCKED: division/employment chain failed"); return; }
  if (putResult.status >= 400) { console.log("BLOCKED: PUT employee failed"); return; }

  const types = stRes.data.values || [];
  const fastlonn = types.find((t: any) => t.name === "Fastlønn");
  const bonus = types.find((t: any) => t.name === "Bonus");
  if (!fastlonn || !bonus) { console.log("BLOCKED: salary types not found"); return; }
  fastlonnId = fastlonn.id;
  bonusId = bonus.id;

  const vt = vtRes.data.values?.[0];
  if (!vt) { console.log("BLOCKED: voucherType not found"); return; }
  vtId = vt.id;

  const accts = acRes.data.values || [];
  const a5000 = accts.find((a: any) => a.number === 5000);
  const a2050 = accts.find((a: any) => a.number === 2050);
  if (!a5000 || !a2050) { console.log("BLOCKED: accounts not found"); return; }
  a5000Id = a5000.id;
  a2050Id = a2050.id;

  console.log(`  Fastlønn: id=${fastlonnId}, Bonus: id=${bonusId}`);
  console.log(`  Lønnsbilag: id=${vtId}`);
  console.log(`  Account 5000: id=${a5000Id}, Account 2050: id=${a2050Id}`);

  console.log("\n=== Round 3: POST /salary/transaction || POST /voucher (2 calls parallel) ===");
  const round3Start = Date.now();

  const [txRes, vRes] = await Promise.all([
    api("POST", "/salary/transaction?generateTaxDeduction=true", {
      date: "2026-03-21", year: 2026, month: 3, paySlipsAvailableDate: "2026-03-21",
      payslips: [{
        employee: { id: empId }, date: "2026-03-21", year: 2026, month: 3,
        specifications: [
          { employee: { id: empId }, salaryType: { id: fastlonnId },
            description: "Fastlønn mars 2026", year: 2026, month: 3,
            count: 1, rate: BASE_SALARY, amount: BASE_SALARY },
          { employee: { id: empId }, salaryType: { id: bonusId },
            description: "Bonus mars 2026", year: 2026, month: 3,
            count: 1, rate: BONUS_AMT, amount: BONUS_AMT },
        ],
      }],
    }),
    api("POST", "/ledger/voucher?sendToLedger=true", {
      voucherType: { id: vtId },
      date: "2026-03-21",
      description: `Lønn mars 2026 - Fastlønn ${BASE_SALARY} + Bonus ${BONUS_AMT}`,
      postings: [
        { account: { id: a5000Id }, amountGross: BASE_SALARY, amountGrossCurrency: BASE_SALARY, description: "Fastlønn mars 2026", row: 1 },
        { account: { id: a5000Id }, amountGross: BONUS_AMT, amountGrossCurrency: BONUS_AMT, description: "Bonus mars 2026", row: 2 },
        { account: { id: a2050Id }, amountGross: -TOTAL, amountGrossCurrency: -TOTAL, description: "Lønn mars 2026", row: 3 },
      ],
    }),
  ]);

  console.log(`Round 3 total time: ${Date.now() - round3Start}ms`);
  console.log(`Salary tx: ${txRes.status}`);
  console.log(`Voucher: ${vRes.status}`);

  if (txRes.status === 201) {
    const payslipId = txRes.data.value?.payslips?.[0]?.id;
    if (payslipId) {
      // Verify payslip (extra call, not part of the 9-call path)
      console.log("\n=== Verification (extra, not part of optimal path) ===");
      const psRes = await api("GET", `/salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`);
      if (psRes.status === 200) {
        const ps = psRes.data.value;
        console.log(`Payslip: grossAmount=${ps.grossAmount}, amount=${ps.amount}`);
        for (const spec of (ps.specifications || [])) {
          console.log(`  spec: ${spec.salaryType?.name} amount=${spec.amount} rate=${spec.rate} count=${spec.count}`);
        }
      }
    }
  }

  if (vRes.status === 201) {
    const vid = vRes.data.value?.id;
    // Verify voucher amounts (extra call)
    const vReadRes = await api("GET", `/ledger/voucher/${vid}?fields=*,postings(*)`);
    if (vReadRes.status === 200) {
      const vp = vReadRes.data.value?.postings || [];
      console.log("\nVoucher postings read-back:");
      for (const p of vp) {
        console.log(`  row=${p.row} amount=${p.amount} amountGross=${p.amountGross}`);
      }
    }
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Total API calls in optimal path: 9 (1 + 7 + 2 = 10 actual, but POST /division → POST /employment is a chain within round 2)`);
  console.log(`Calls: GET employee + POST division + PUT employee + POST employment + GET salary/type + GET voucherType + GET account + POST salary/transaction + POST voucher`);
  console.log(`Salary tx: ${txRes.status === 201 ? 'SUCCESS' : 'FAILED'}`);
  console.log(`Voucher: ${vRes.status === 201 ? 'SUCCESS' : 'FAILED'}`);
}

main().catch(console.error);
