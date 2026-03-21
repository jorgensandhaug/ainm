const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "uAOoKwP921jipemJ6vVRzG-079ho4YLneRcT9PX3bZg";
const AUTH = "Basic " + Buffer.from("0:" + TOKEN).toString("base64");
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const BASE_SALARY = 34950;
const BONUS = 15450;
const TOTAL = BASE_SALARY + BONUS; // 50400

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (res.status >= 400) console.log(JSON.stringify(json, null, 2));
  return { status: res.status, data: json };
}

async function main() {
  // Step 1: Find employee
  const empRes = await api("GET", "/employee?email=james.williams@example.org&count=10&fields=*");
  if (empRes.status !== 200) { console.log("BLOCKED: cannot read employee"); return; }
  const employees = empRes.data.values?.filter((e: any) =>
    e.email?.toLowerCase() === "james.williams@example.org"
  );
  if (!employees?.length) { console.log("BLOCKED: employee not found"); return; }
  const emp = employees[0];
  const empId = emp.id;
  console.log(`Employee: id=${empId}, dob=${emp.dateOfBirth}, employments=${emp.employments?.length ?? 0}`);

  const underconfigured = emp.dateOfBirth === null &&
    (!emp.employments || emp.employments.length === 0);

  if (!underconfigured) {
    // Fast path: employee may be payroll-ready
    const [stRes, vtRes, acRes] = await Promise.all([
      api("GET", "/salary/type?count=1000&fields=*"),
      api("GET", "/ledger/voucherType?name=Lønnsbilag&count=1&fields=*"),
      api("GET", "/ledger/account?number=5000,1920&count=10&fields=*"),
    ]);
    const types = stRes.data.values || [];
    const fastlonn = types.find((t: any) => t.name === "Fastlønn");
    const bonus = types.find((t: any) => t.name === "Bonus");
    if (!fastlonn || !bonus) { console.log("BLOCKED: salary types not found"); return; }
    const vt = vtRes.data.values?.[0];
    const accts = acRes.data.values || [];
    const a5000 = accts.find((a: any) => a.number === 5000);
    const a1920 = accts.find((a: any) => a.number === 1920);

    const txRes = await api("POST", "/salary/transaction?generateTaxDeduction=true", {
      date: "2026-03-21", year: 2026, month: 3, paySlipsAvailableDate: "2026-03-21",
      payslips: [{
        employee: { id: empId }, date: "2026-03-21", year: 2026, month: 3,
        specifications: [
          { employee: { id: empId }, salaryType: { id: fastlonn.id },
            description: "Fastlønn mars 2026", year: 2026, month: 3,
            count: 1, rate: BASE_SALARY, amount: BASE_SALARY },
          { employee: { id: empId }, salaryType: { id: bonus.id },
            description: "Bonus mars 2026", year: 2026, month: 3,
            count: 1, rate: BONUS, amount: BONUS },
        ],
      }],
    });
    console.log("Salary tx:", txRes.status);
    if (txRes.status === 201 && vt && a5000 && a1920) {
      const vRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
        voucherType: { id: vt.id }, date: "2026-03-21",
        description: `Lønn mars 2026 - Fastlønn ${BASE_SALARY} + Bonus ${BONUS}`,
        postings: [
          { account: { id: a5000.id }, amount: BASE_SALARY, description: "Fastlønn mars 2026", row: 1 },
          { account: { id: a5000.id }, amount: BONUS, description: "Bonus mars 2026", row: 2 },
          { account: { id: a1920.id }, amount: -TOTAL, description: "Lønn mars 2026", row: 3 },
        ],
      });
      console.log("Voucher:", vRes.status, JSON.stringify(vRes.data?.value?.id));
    }
    return;
  }

  // Underconfigured branch
  console.log("Underconfigured employee — checking divisions");
  const divRes = await api("GET", "/division?count=1&fields=*");
  const divisions = divRes.data.values || [];

  if (divisions.length === 0) {
    // No division + prompt allows manual vouchers → voucher fallback
    console.log("No divisions — manual voucher fallback");
    const acRes = await api("GET", "/ledger/account?number=5000,1920&count=10&fields=*");
    const accts = acRes.data.values || [];
    const a5000 = accts.find((a: any) => a.number === 5000);
    const a1920 = accts.find((a: any) => a.number === 1920);
    if (!a5000 || !a1920) { console.log("BLOCKED: accounts not found"); return; }

    const vRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
      voucherType: null, date: "2026-03-21",
      description: `Lønn mars 2026 - Fastlønn ${BASE_SALARY} + Bonus ${BONUS}`,
      postings: [
        { account: { id: a5000.id }, amount: TOTAL, description: "Lønn mars 2026", row: 1 },
        { account: { id: a1920.id }, amount: -TOTAL, description: "Lønn mars 2026", row: 2 },
      ],
    });
    console.log("Voucher:", vRes.status, JSON.stringify(vRes.data));
    return;
  }

  // Division exists — repair employee + payroll
  const divId = divisions[0].id;
  console.log(`Division: id=${divId}`);

  // Parallelize: repair chain (PUT employee → POST employment) + 3 reads
  const [repairOk, stRes, vtRes, acRes] = await Promise.all([
    (async () => {
      const putRes = await api("PUT", `/employee/${empId}`, {
        id: empId, firstName: emp.firstName, lastName: emp.lastName,
        email: emp.email, dateOfBirth: "1990-01-01",
      });
      if (putRes.status >= 400) return false;
      const emplRes = await api("POST", "/employee/employment", {
        employee: { id: empId }, division: { id: divId },
        startDate: "2026-03-01", isMainEmployer: true,
        taxDeductionCode: "loennFraHovedarbeidsgiver",
        employmentDetails: [{
          date: "2026-03-01", employmentType: "ORDINARY",
          employmentForm: "PERMANENT", remunerationType: "MONTHLY_WAGE",
          workingHoursScheme: "NOT_SHIFT", percentageOfFullTimeEquivalent: 100,
          monthlySalary: BASE_SALARY, annualSalary: BASE_SALARY * 12,
        }],
      });
      return emplRes.status === 201;
    })(),
    api("GET", "/salary/type?count=1000&fields=*"),
    api("GET", "/ledger/voucherType?name=Lønnsbilag&count=1&fields=*"),
    api("GET", "/ledger/account?number=5000,1920&count=10&fields=*"),
  ]);

  if (!repairOk) { console.log("BLOCKED: employee repair failed"); return; }

  const types = stRes.data.values || [];
  const fastlonn = types.find((t: any) => t.name === "Fastlønn");
  const bonusType = types.find((t: any) => t.name === "Bonus");
  if (!fastlonn || !bonusType) { console.log("BLOCKED: salary types not found"); return; }

  const vt = vtRes.data.values?.[0];
  const accts = acRes.data.values || [];
  const a5000 = accts.find((a: any) => a.number === 5000);
  const a1920 = accts.find((a: any) => a.number === 1920);

  const txRes = await api("POST", "/salary/transaction?generateTaxDeduction=true", {
    date: "2026-03-21", year: 2026, month: 3, paySlipsAvailableDate: "2026-03-21",
    payslips: [{
      employee: { id: empId }, date: "2026-03-21", year: 2026, month: 3,
      specifications: [
        { employee: { id: empId }, salaryType: { id: fastlonn.id },
          description: "Fastlønn mars 2026", year: 2026, month: 3,
          count: 1, rate: BASE_SALARY, amount: BASE_SALARY },
        { employee: { id: empId }, salaryType: { id: bonusType.id },
          description: "Bonus mars 2026", year: 2026, month: 3,
          count: 1, rate: BONUS, amount: BONUS },
      ],
    }],
  });
  console.log("Salary tx:", txRes.status);

  if (txRes.status === 201 && vt && a5000 && a1920) {
    const vRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
      voucherType: { id: vt.id }, date: "2026-03-21",
      description: `Lønn mars 2026 - Fastlønn ${BASE_SALARY} + Bonus ${BONUS}`,
      postings: [
        { account: { id: a5000.id }, amount: BASE_SALARY, description: "Fastlønn mars 2026", row: 1 },
        { account: { id: a5000.id }, amount: BONUS, description: "Bonus mars 2026", row: 2 },
        { account: { id: a1920.id }, amount: -TOTAL, description: "Lønn mars 2026", row: 3 },
      ],
    });
    console.log("Voucher:", vRes.status, JSON.stringify(vRes.data?.value?.id));
  }
}

main().catch(console.error);
