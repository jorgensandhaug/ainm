// Test parallel writes and call reduction using existing sandbox employee
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

function genOrgNr(): string {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  while (true) {
    const digits = [9];
    for (let i = 0; i < 7; i++) digits.push(Math.floor(Math.random() * 10));
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += digits[i] * weights[i];
    const rem = sum % 11;
    if (rem === 1) continue;
    const check = rem === 0 ? 0 : 11 - rem;
    digits.push(check);
    return digits.join("");
  }
}

async function main() {
  // Create a proper test employee
  const empRes = await api("POST", "/employee", {
    firstName: "ParTest",
    lastName: "Worker",
    email: `partest-${Date.now()}@example.org`,
    userType: "STANDARD",
  });
  if (empRes.status !== 201) {
    console.log("Failed to create employee, trying without userType...");
    // Find an existing employee with employment instead
    const existRes = await api("GET", "/employee?count=5&fields=*");
    console.log("Existing employees:", existRes.data.values?.map((e: any) => `${e.id} ${e.firstName} ${e.lastName} dob=${e.dateOfBirth}`));
    return;
  }
  const empId = empRes.data.value.id;
  console.log(`Created test employee: id=${empId}`);

  // Create division + repair employee in parallel
  const orgNr = genOrgNr();
  const [divRes] = await Promise.all([
    api("POST", "/division", {
      name: "TestDiv",
      organizationNumber: orgNr,
      startDate: "2026-01-01",
      municipalityDate: "2026-01-01",
      municipality: { id: 1 },
    }),
    api("PUT", `/employee/${empId}`, {
      id: empId,
      firstName: "ParTest",
      lastName: "Worker",
      dateOfBirth: "1990-01-01",
    }),
  ]);
  const divId = divRes.data.value.id;

  // Create employment + resolve lookups in parallel
  const [emplRes, stRes, vtRes, accRes] = await Promise.all([
    api("POST", "/employee/employment", {
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
    }),
    api("GET", "/salary/type?count=1000&fields=*"),
    api("GET", "/ledger/voucherType?name=Lønnsbilag&count=1&fields=*"),
    api("GET", "/ledger/account?number=5000,1920&count=10&fields=*"),
  ]);

  const fastlonn = stRes.data.values.find((t: any) => t.name === "Fastlønn");
  const bonus = stRes.data.values.find((t: any) => t.name === "Bonus");
  const voucherTypeId = vtRes.data.values[0].id;
  const acc5000 = accRes.data.values.find((a: any) => a.number === 5000);
  const acc1920 = accRes.data.values.find((a: any) => a.number === 1920);
  console.log(`Fastlønn=${fastlonn.id}, Bonus=${bonus.id}, VT=${voucherTypeId}, 5000=${acc5000.id}, 1920=${acc1920.id}`);

  // TEST 1: Parallel salary transaction + voucher
  console.log("\n=== TEST 1: Parallel POST salary/transaction + POST voucher ===");
  const salaryAmount = 25000;
  const bonusAmount = 10000;
  const gross = salaryAmount + bonusAmount;

  const t0 = Date.now();
  const [txResult, vResult] = await Promise.all([
    api("POST", "/salary/transaction?generateTaxDeduction=true", {
      date: "2026-07-20", year: 2026, month: 7, paySlipsAvailableDate: "2026-07-20",
      payslips: [{
        employee: { id: empId }, date: "2026-07-20", year: 2026, month: 7,
        specifications: [
          { employee: { id: empId }, salaryType: { id: fastlonn.id }, description: "Fastlønn jul 2026", year: 2026, month: 7, count: 1, rate: salaryAmount, amount: salaryAmount },
          { employee: { id: empId }, salaryType: { id: bonus.id }, description: "Bonus jul 2026", year: 2026, month: 7, count: 1, rate: bonusAmount, amount: bonusAmount },
        ],
      }],
    }),
    api("POST", "/ledger/voucher?sendToLedger=true", {
      voucherType: { id: voucherTypeId },
      date: "2026-07-20",
      description: `Lønn jul 2026 - Fastlønn ${salaryAmount} + Bonus ${bonusAmount}`,
      postings: [
        { account: { id: acc5000.id }, amount: salaryAmount, description: "Fastlønn", row: 1 },
        { account: { id: acc5000.id }, amount: bonusAmount, description: "Bonus", row: 2 },
        { account: { id: acc1920.id }, amount: -gross, description: "Utbetalt lønn", row: 3 },
      ],
    }),
  ]);
  const t1 = Date.now();
  console.log(`Parallel time: ${t1 - t0}ms`);
  console.log(`Salary tx: ${txResult.status}${txResult.status === 201 ? ` id=${txResult.data.value.id}` : ""}`);
  console.log(`Voucher: ${vResult.status}${vResult.status === 201 ? ` id=${vResult.data.value.id} number=${vResult.data.value.number}` : ""}`);

  // TEST 2: Can salary type be resolved by number instead of id?
  console.log("\n=== TEST 2: salaryType by number instead of id ===");
  const stByNum = await api("POST", "/salary/transaction?generateTaxDeduction=true", {
    date: "2026-08-20", year: 2026, month: 8, paySlipsAvailableDate: "2026-08-20",
    payslips: [{
      employee: { id: empId }, date: "2026-08-20", year: 2026, month: 8,
      specifications: [
        { employee: { id: empId }, salaryType: { number: "1000" }, description: "Fastlønn aug 2026", year: 2026, month: 8, count: 1, rate: 15000, amount: 15000 },
      ],
    }],
  });
  console.log(`salaryType by number: ${stByNum.status}`);
  if (stByNum.status === 201) {
    console.log("SUCCESS - salaryType by number works! GET /salary/type could be eliminated!");
  }

  // TEST 3: Can accounts be referenced by number in voucher?
  console.log("\n=== TEST 3: account by number in voucher ===");
  const accByNum = await api("POST", "/ledger/voucher?sendToLedger=true", {
    voucherType: { id: voucherTypeId },
    date: "2026-08-20",
    description: "Test account by number",
    postings: [
      { account: { number: 5000 }, amount: 1000, description: "Test debit", row: 1 },
      { account: { number: 1920 }, amount: -1000, description: "Test credit", row: 2 },
    ],
  });
  console.log(`account by number: ${accByNum.status}`);
  if (accByNum.status === 201) {
    console.log("SUCCESS - account by number works! GET /ledger/account could be eliminated!");
  }

  // TEST 4: Can voucherType be referenced by name?
  console.log("\n=== TEST 4: voucherType by name ===");
  const vtByName = await api("POST", "/ledger/voucher?sendToLedger=true", {
    voucherType: { name: "Lønnsbilag" },
    date: "2026-09-20",
    description: "Test voucherType by name",
    postings: [
      { account: { id: acc5000.id }, amount: 500, description: "Test debit", row: 1 },
      { account: { id: acc1920.id }, amount: -500, description: "Test credit", row: 2 },
    ],
  });
  console.log(`voucherType by name: ${vtByName.status}`);
  if (vtByName.status === 201) {
    console.log("SUCCESS - voucherType by name works! GET /ledger/voucherType could be eliminated!");
  }

  console.log("\n=== ALL TESTS COMPLETE ===");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
