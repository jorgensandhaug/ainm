// Test: Can POST /salary/transaction and POST /ledger/voucher run in parallel?
// Also test: Can we skip GET /ledger/voucherType and use voucherType: null with row fields?
// Also test: Can we use account number instead of id in voucher postings?
// Also test: Can we use salaryType by number instead of id?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (r.status >= 400) console.log(JSON.stringify(json, null, 2));
  return { status: r.status, data: json };
}

async function main() {
  // First, create a test employee to work with
  const empRes = await api("POST", "/employee", {
    firstName: "ParallelTest",
    lastName: "Worker",
    email: `parallel-test-${Date.now()}@example.org`,
    dateOfBirth: null,
  });
  const empId = empRes.data.value.id;
  console.log(`Created test employee: id=${empId}`);

  // Get existing division (sandbox should have one)
  const divRes = await api("GET", "/division?count=1&fields=*");
  let divId: number;
  if (divRes.data.count > 0) {
    divId = divRes.data.values[0].id;
    console.log(`Existing division: id=${divId}`);
  } else {
    throw new Error("No division found in sandbox");
  }

  // Repair employee
  await api("PUT", `/employee/${empId}`, {
    id: empId,
    firstName: "ParallelTest",
    lastName: "Worker",
    dateOfBirth: "1990-01-01",
  });

  // Create employment with inline details
  await api("POST", "/employee/employment", {
    employee: { id: empId },
    startDate: "2026-03-01",
    isMainEmployer: true,
    taxDeductionCode: "loennFraHovedarbeidsgiver",
    division: { id: divId },
    employmentDetails: [{
      date: "2026-03-01",
      employmentType: "ORDINARY",
      employmentForm: "PERMANENT",
      remunerationType: "MONTHLY_WAGE",
      workingHoursScheme: "NOT_SHIFT",
      percentageOfFullTimeEquivalent: 100,
      monthlySalary: 25000,
      annualSalary: 300000,
    }],
  });

  // Get salary types
  const stRes = await api("GET", "/salary/type?count=1000&fields=*");
  const fastlonn = stRes.data.values.find((t: any) => t.name === "Fastlønn");
  const bonus = stRes.data.values.find((t: any) => t.name === "Bonus");
  console.log(`Fastlønn id=${fastlonn.id}, Bonus id=${bonus.id}`);

  // Get voucherType and accounts
  const vtRes = await api("GET", "/ledger/voucherType?name=Lønnsbilag&count=1&fields=*");
  const voucherTypeId = vtRes.data.values[0].id;
  console.log(`Lønnsbilag voucherType id=${voucherTypeId}`);

  const accRes = await api("GET", "/ledger/account?number=5000,1920&count=10&fields=*");
  const acc5000 = accRes.data.values.find((a: any) => a.number === 5000);
  const acc1920 = accRes.data.values.find((a: any) => a.number === 1920);
  console.log(`Account 5000 id=${acc5000.id}, 1920 id=${acc1920.id}`);

  // TEST 1: Can salary transaction and voucher run in parallel?
  console.log("\n=== TEST 1: Parallel salary transaction + voucher ===");
  const salaryAmount = 25000;
  const bonusAmount = 10000;
  const gross = salaryAmount + bonusAmount;

  const [txResult, vResult] = await Promise.all([
    api("POST", "/salary/transaction?generateTaxDeduction=true", {
      date: "2026-04-20", year: 2026, month: 4, paySlipsAvailableDate: "2026-04-20",
      payslips: [{
        employee: { id: empId }, date: "2026-04-20", year: 2026, month: 4,
        specifications: [
          { employee: { id: empId }, salaryType: { id: fastlonn.id }, description: "Fastlønn april 2026", year: 2026, month: 4, count: 1, rate: salaryAmount, amount: salaryAmount },
          { employee: { id: empId }, salaryType: { id: bonus.id }, description: "Bonus april 2026", year: 2026, month: 4, count: 1, rate: bonusAmount, amount: bonusAmount },
        ],
      }],
    }),
    api("POST", "/ledger/voucher?sendToLedger=true", {
      voucherType: { id: voucherTypeId },
      date: "2026-04-20",
      description: `Lønn april 2026 - Fastlønn ${salaryAmount} + Bonus ${bonusAmount}`,
      postings: [
        { account: { id: acc5000.id }, amount: salaryAmount, description: "Fastlønn", row: 1 },
        { account: { id: acc5000.id }, amount: bonusAmount, description: "Bonus", row: 2 },
        { account: { id: acc1920.id }, amount: -gross, description: "Utbetalt lønn", row: 3 },
      ],
    }),
  ]);
  console.log(`Salary tx: ${txResult.status}, Voucher: ${vResult.status}`);
  if (txResult.status === 201) console.log("Salary transaction id:", txResult.data.value.id);
  if (vResult.status === 201) console.log("Voucher id:", vResult.data.value.id, "number:", vResult.data.value.number);

  // TEST 2: Can we use voucherType: null with row fields?
  console.log("\n=== TEST 2: voucherType null with row fields ===");
  const vNullRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
    voucherType: null,
    date: "2026-05-20",
    description: "Test null voucherType",
    postings: [
      { account: { id: acc5000.id }, amount: 1000, description: "Test debit", row: 1 },
      { account: { id: acc1920.id }, amount: -1000, description: "Test credit", row: 2 },
    ],
  });
  console.log(`Null voucherType result: ${vNullRes.status}`);

  // TEST 3: Can we use salaryType by number (e.g. "1000" for Fastlønn)?
  console.log("\n=== TEST 3: salaryType by number ===");
  const stByNumRes = await api("POST", "/salary/transaction?generateTaxDeduction=true", {
    date: "2026-05-20", year: 2026, month: 5, paySlipsAvailableDate: "2026-05-20",
    payslips: [{
      employee: { id: empId }, date: "2026-05-20", year: 2026, month: 5,
      specifications: [
        { employee: { id: empId }, salaryType: { number: "1000" }, description: "Fastlønn test", year: 2026, month: 5, count: 1, rate: 10000, amount: 10000 },
      ],
    }],
  });
  console.log(`SalaryType by number result: ${stByNumRes.status}`);

  console.log("\n=== ALL TESTS COMPLETE ===");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
