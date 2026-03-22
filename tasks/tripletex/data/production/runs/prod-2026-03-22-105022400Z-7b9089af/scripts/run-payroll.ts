const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "iZxYBpL23YszcDSNTtUVkG47aDa5Wl8KDOhhRA0RcL8";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const EMAIL = "miguel.martinez@example.org";
const BASE_SALARY = 46800;
const BONUS = 13350;
const GROSS = BASE_SALARY + BONUS; // 60150
const YEAR = 2026;
const MONTH = 3;
const PAY_DATE = "2026-03-01";

const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: h };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (r.status >= 400) {
    console.log("ERROR:", JSON.stringify(json, null, 2));
    throw new Error(`${method} ${path} → ${r.status}`);
  }
  return json;
}

function generateOrgNumber(): string {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  while (true) {
    const digits = [9];
    for (let i = 0; i < 7; i++) digits.push(Math.floor(Math.random() * 10));
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += digits[i] * weights[i];
    const remainder = sum % 11;
    if (remainder === 1) continue; // invalid, retry
    const check = remainder === 0 ? 0 : 11 - remainder;
    digits.push(check);
    return digits.join("");
  }
}

async function main() {
  // Step 1: 4 parallel free reads
  const [empRes, salTypeRes, accRes, vtRes] = await Promise.all([
    api("GET", `/employee?email=${EMAIL}&count=10&fields=*`),
    api("GET", `/salary/type?count=1000&fields=*`),
    api("GET", `/ledger/account?number=5000,1920&count=10&fields=*`),
    api("GET", `/ledger/voucherType?name=Lønnsbilag&count=1&fields=id,name`),
  ]);

  // Resolve employee
  const employees = empRes.values || [];
  const emp = employees.find((e: any) => e.email === EMAIL);
  if (!emp) throw new Error("Employee not found");
  console.log(`Employee: id=${emp.id}, name=${emp.firstName} ${emp.lastName}, dob=${emp.dateOfBirth}, employments=${JSON.stringify(emp.employments)}`);

  // Resolve salary types
  const salTypes = salTypeRes.values || [];
  const fastlonn = salTypes.find((s: any) => s.name === "Fastlønn");
  const bonus = salTypes.find((s: any) => s.name === "Bonus");
  if (!fastlonn) throw new Error("Fastlønn salary type not found");
  if (!bonus) throw new Error("Bonus salary type not found");
  console.log(`Fastlønn id=${fastlonn.id}, Bonus id=${bonus.id}`);

  // Resolve accounts
  const accounts = accRes.values || [];
  const acc5000 = accounts.find((a: any) => a.number === 5000);
  const acc1920 = accounts.find((a: any) => a.number === 1920);
  if (!acc5000 || !acc1920) throw new Error("Accounts not found");
  console.log(`Account 5000 id=${acc5000.id}, Account 1920 id=${acc1920.id}`);

  // Resolve voucherType
  const vtValues = vtRes.values || [];
  const voucherType = vtValues.find((v: any) => v.name === "Lønnsbilag");
  if (!voucherType) throw new Error("Lønnsbilag voucherType not found");
  console.log(`VoucherType Lønnsbilag id=${voucherType.id}`);

  // Check if underconfigured
  const isUnderconfigured = emp.dateOfBirth === null || emp.dateOfBirth === undefined;
  const hasNoEmployments = !emp.employments || emp.employments.length === 0;

  let employmentId: number | undefined;

  if (isUnderconfigured && hasNoEmployments) {
    console.log("=== Underconfigured employee branch ===");

    // Step 2: Parallel POST /division + PUT /employee
    const orgNum = generateOrgNumber();
    const [divRes, putEmpRes] = await Promise.all([
      api("POST", "/division", {
        name: "Hovudavdeling",
        organizationNumber: orgNum,
        startDate: "2026-01-01",
        municipalityDate: "2026-01-01",
        municipality: { id: 1 },
      }),
      api("PUT", `/employee/${emp.id}`, {
        id: emp.id,
        firstName: emp.firstName,
        lastName: emp.lastName,
        dateOfBirth: "1990-01-01",
      }),
    ]);

    const divisionId = divRes.value?.id;
    console.log(`Division created: id=${divisionId}`);
    console.log(`Employee dateOfBirth repaired`);

    // Verify employee repair (free GET)
    const empVerify = await api("GET", `/employee/${emp.id}?fields=id,firstName,lastName,dateOfBirth`);
    console.log(`Employee verify: dob=${empVerify.value?.dateOfBirth}`);

    // Step 3: POST /employee/employment with inline employmentDetails
    const emplRes = await api("POST", "/employee/employment", {
      employee: { id: emp.id },
      division: { id: divisionId },
      startDate: PAY_DATE,
      isMainEmployer: true,
      taxDeductionCode: "loennFraHovedarbeidsgiver",
      employmentDetails: [{
        date: PAY_DATE,
        employmentType: "ORDINARY",
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 100,
        monthlySalary: BASE_SALARY,
        annualSalary: BASE_SALARY * 12,
      }],
    });

    employmentId = emplRes.value?.id;
    console.log(`Employment created: id=${employmentId}`);

    // Verify employment (free GET)
    const emplVerify = await api("GET", `/employee/employment/${employmentId}?fields=*,employmentDetails(*)`);
    console.log(`Employment verify: division=${emplVerify.value?.division?.id}, startDate=${emplVerify.value?.startDate}`);
    if (emplVerify.value?.employmentDetails) {
      const det = emplVerify.value.employmentDetails[0];
      console.log(`  monthlySalary=${det?.monthlySalary}, remunerationType=${det?.remunerationType}`);
    }
  } else {
    console.log("=== Payroll-ready branch ===");
    // Check if we need to get employment details
    if (!hasNoEmployments) {
      const emplListRes = await api("GET", `/employee/employment?employeeId=${emp.id}&count=20&fields=*`);
      const empls = emplListRes.values || [];
      if (empls.length > 0) {
        employmentId = empls[0].id;
        console.log(`Existing employment: id=${employmentId}`);
      }
    }
  }

  // Step 4 (or Step 2 for payroll-ready): Parallel POST /salary/transaction + POST /ledger/voucher
  const [salTxRes, voucherRes] = await Promise.all([
    api("POST", "/salary/transaction?generateTaxDeduction=true", {
      date: PAY_DATE,
      year: YEAR,
      month: MONTH,
      paySlipsAvailableDate: PAY_DATE,
      payslips: [{
        employee: { id: emp.id },
        specifications: [
          {
            employee: { id: emp.id },
            salaryType: { id: fastlonn.id },
            description: "Fastlønn",
            year: YEAR,
            month: MONTH,
            count: 1,
            rate: BASE_SALARY,
            amount: BASE_SALARY,
          },
          {
            employee: { id: emp.id },
            salaryType: { id: bonus.id },
            description: "Bonus",
            year: YEAR,
            month: MONTH,
            count: 1,
            rate: BONUS,
            amount: BONUS,
          },
        ],
      }],
    }),
    api("POST", "/ledger/voucher?sendToLedger=true", {
      date: PAY_DATE,
      description: `Lønn mars 2026 - Fastlønn ${BASE_SALARY} + Bonus ${BONUS}`,
      voucherType: { id: voucherType.id },
      postings: [
        {
          account: { id: acc5000.id },
          description: `Fastlønn ${BASE_SALARY}`,
          amountGross: BASE_SALARY,
          amountGrossCurrency: BASE_SALARY,
          row: 1,
        },
        {
          account: { id: acc5000.id },
          description: `Bonus ${BONUS}`,
          amountGross: BONUS,
          amountGrossCurrency: BONUS,
          row: 2,
        },
        {
          account: { id: acc1920.id },
          description: `Utbetaling lønn mars 2026`,
          amountGross: -GROSS,
          amountGrossCurrency: -GROSS,
          row: 3,
        },
      ],
    }),
  ]);

  const txId = salTxRes.value?.id;
  const payslipStub = salTxRes.value?.payslips?.[0];
  const payslipId = payslipStub?.id;
  const voucherId = voucherRes.value?.id;
  console.log(`Salary transaction: id=${txId}, payslip id=${payslipId}`);
  console.log(`Voucher: id=${voucherId}, number=${voucherRes.value?.number}`);

  // Step 5: Verification (3 parallel free GETs)
  const [payslipVerify, voucherVerify, txVerify] = await Promise.all([
    api("GET", `/salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`),
    api("GET", `/ledger/voucher/${voucherId}?fields=*,postings(*,account(id,number,name)),voucherType(id,name)`),
    api("GET", `/salary/transaction/${txId}?fields=*`),
  ]);

  // Log payslip verification
  const ps = payslipVerify.value;
  console.log(`\n=== PAYSLIP VERIFICATION ===`);
  console.log(`grossAmount=${ps?.grossAmount}, amount=${ps?.amount}`);
  if (ps?.specifications) {
    for (const spec of ps.specifications) {
      console.log(`  ${spec.salaryType?.name || spec.description}: amount=${spec.amount}, rate=${spec.rate}, count=${spec.count}`);
    }
  }

  // Log voucher verification
  const v = voucherVerify.value;
  console.log(`\n=== VOUCHER VERIFICATION ===`);
  console.log(`voucherType: id=${v?.voucherType?.id}, name=${v?.voucherType?.name}`);
  if (v?.postings) {
    for (const p of v.postings) {
      console.log(`  account=${p.account?.number} (${p.account?.name}): amountGross=${p.amountGross}, amount=${p.amount}`);
    }
  }

  // Log transaction verification
  console.log(`\n=== TRANSACTION VERIFICATION ===`);
  console.log(`transaction id=${txVerify.value?.id}, year=${txVerify.value?.year}, month=${txVerify.value?.month}`);

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error(e); process.exit(1); });
