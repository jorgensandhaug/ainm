const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "msNHchM64RMrAsbFNAUXN1rirule4gAXjVCk-70Bnas";
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
  if (r.status >= 400) { console.log(JSON.stringify(json, null, 2)); throw new Error(`${r.status}`); }
  return json;
}

async function main() {
  // Step 1: Find employee
  const empRes = await api("GET", "/employee?email=brita.berge@example.org&count=10&fields=*");
  const employees = empRes.values.filter((e: any) =>
    e.email?.toLowerCase() === "brita.berge@example.org"
  );
  if (employees.length !== 1) throw new Error(`Expected 1 employee, got ${employees.length}`);
  const emp = employees[0];
  const empId = emp.id;
  console.log(`Employee: ${emp.firstName} ${emp.lastName}, id=${empId}, dob=${emp.dateOfBirth}, employments=${JSON.stringify(emp.employments)}`);

  const underconfigured = emp.dateOfBirth === null ||
    !emp.employments || emp.employments.length === 0 ||
    emp.employments.every((e: any) => !e.startDate);

  if (!underconfigured) {
    // Payroll-ready: 7-call path
    const [salaryTypesRes, voucherTypeRes, accountsRes] = await Promise.all([
      api("GET", "/salary/type?count=1000&fields=*"),
      api("GET", "/ledger/voucherType?name=Lønnsbilag&count=1&fields=*"),
      api("GET", "/ledger/account?number=5000,1920&count=10&fields=*"),
    ]);

    const fastlonn = salaryTypesRes.values.find((t: any) => t.name === "Fastlønn" || t.number === "1000");
    const bonus = salaryTypesRes.values.find((t: any) => t.name === "Bonus");
    if (!fastlonn || !bonus) throw new Error("Missing salary types");

    const voucherType = voucherTypeRes.values[0];
    const acc5000 = accountsRes.values.find((a: any) => a.number === 5000);
    const acc1920 = accountsRes.values.find((a: any) => a.number === 1920);

    const txRes = await api("POST", "/salary/transaction?generateTaxDeduction=true", {
      date: "2026-03-20", year: 2026, month: 3, paySlipsAvailableDate: "2026-03-20",
      payslips: [{
        employee: { id: empId }, date: "2026-03-20", year: 2026, month: 3,
        specifications: [
          { employee: { id: empId }, salaryType: { id: fastlonn.id }, description: "Fastlønn mars 2026", year: 2026, month: 3, count: 1, rate: 36800, amount: 36800 },
          { employee: { id: empId }, salaryType: { id: bonus.id }, description: "Bonus mars 2026", year: 2026, month: 3, count: 1, rate: 14100, amount: 14100 },
        ],
      }],
    });
    console.log("Salary transaction:", JSON.stringify(txRes.value, null, 2));

    const gross = 36800 + 14100;
    await api("POST", "/ledger/voucher?sendToLedger=true", {
      voucherType: { id: voucherType.id },
      date: "2026-03-20",
      description: `Lønn mars 2026 - Fastlønn 36800 + Bonus 14100`,
      postings: [
        { account: { id: acc5000.id }, amount: 36800, description: "Fastlønn", row: 1 },
        { account: { id: acc5000.id }, amount: 14100, description: "Bonus", row: 2 },
        { account: { id: acc1920.id }, amount: -gross, description: "Utbetalt lønn", row: 3 },
      ],
    });
    console.log("Done (payroll-ready path, 7 calls)");
    return;
  }

  // Underconfigured branch: 9-call path
  console.log("Underconfigured employee — repair + payroll (9-call path)");

  // Step 2-3: Parallel POST /division + PUT /employee
  const orgNr = "9" + String(Math.floor(10000000 + Math.random() * 89999999));
  const [divRes] = await Promise.all([
    api("POST", "/division", {
      name: "Hovudavdeling",
      organizationNumber: orgNr,
      startDate: "2026-01-01",
      municipalityDate: "2026-01-01",
      municipality: { id: 1 },
    }),
    api("PUT", `/employee/${empId}`, {
      id: empId,
      firstName: emp.firstName,
      lastName: emp.lastName,
      email: emp.email,
      dateOfBirth: "1990-01-01",
    }),
  ]);
  const divId = divRes.value.id;
  console.log(`Division created: id=${divId}`);

  // Step 4-7: Parallel POST /employment + 3 reads
  const [empploymentRes, salaryTypesRes, voucherTypeRes, accountsRes] = await Promise.all([
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
        monthlySalary: 36800,
        annualSalary: 36800 * 12,
      }],
    }),
    api("GET", "/salary/type?count=1000&fields=*"),
    api("GET", "/ledger/voucherType?name=Lønnsbilag&count=1&fields=*"),
    api("GET", "/ledger/account?number=5000,1920&count=10&fields=*"),
  ]);

  const fastlonn = salaryTypesRes.values.find((t: any) => t.name === "Fastlønn" || t.number === "1000");
  const bonus = salaryTypesRes.values.find((t: any) => t.name === "Bonus");
  if (!fastlonn || !bonus) throw new Error("Missing salary types: Fastlønn or Bonus");
  console.log(`Fastlønn id=${fastlonn.id}, Bonus id=${bonus.id}`);

  const voucherType = voucherTypeRes.values[0];
  if (!voucherType) throw new Error("Missing voucherType Lønnsbilag");
  console.log(`Lønnsbilag voucherType id=${voucherType.id}`);

  const acc5000 = accountsRes.values.find((a: any) => a.number === 5000);
  const acc1920 = accountsRes.values.find((a: any) => a.number === 1920);
  if (!acc5000 || !acc1920) throw new Error("Missing accounts 5000 or 1920");

  // Step 8: POST salary transaction
  const txRes = await api("POST", "/salary/transaction?generateTaxDeduction=true", {
    date: "2026-03-20", year: 2026, month: 3, paySlipsAvailableDate: "2026-03-20",
    payslips: [{
      employee: { id: empId }, date: "2026-03-20", year: 2026, month: 3,
      specifications: [
        { employee: { id: empId }, salaryType: { id: fastlonn.id }, description: "Fastlønn mars 2026", year: 2026, month: 3, count: 1, rate: 36800, amount: 36800 },
        { employee: { id: empId }, salaryType: { id: bonus.id }, description: "Bonus mars 2026", year: 2026, month: 3, count: 1, rate: 14100, amount: 14100 },
      ],
    }],
  });
  console.log("Salary transaction:", JSON.stringify(txRes.value, null, 2));

  // Step 9: POST voucher
  const gross = 36800 + 14100;
  const vRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
    voucherType: { id: voucherType.id },
    date: "2026-03-20",
    description: `Lønn mars 2026 - Fastlønn 36800 + Bonus 14100`,
    postings: [
      { account: { id: acc5000.id }, amount: 36800, description: "Fastlønn", row: 1 },
      { account: { id: acc5000.id }, amount: 14100, description: "Bonus", row: 2 },
      { account: { id: acc1920.id }, amount: -gross, description: "Utbetalt lønn", row: 3 },
    ],
  });
  console.log("Voucher:", JSON.stringify(vRes.value, null, 2));
  console.log("Done (underconfigured path, 9 calls, 0 errors)");
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
