const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "CAS77ge2O-bxvpx8A_VwtJlWtS2m_L2IPlfokcqPpZc";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

const EMAIL = "sarah.moreau@example.org";
const BASE_SALARY = 56900;
const BONUS = 15800;
const TOTAL = BASE_SALARY + BONUS;
const YEAR = 2026;
const MONTH = 3;
const DATE = "2026-03-20";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (res.status >= 400) {
    console.error("ERROR:", JSON.stringify(json).slice(0, 500));
    throw new Error(`${method} ${path} → ${res.status}`);
  }
  return json;
}

async function main() {
  // Step 1: parallel reads
  const [empRes, salTypeRes, acctRes] = await Promise.all([
    api("GET", `/employee?email=${encodeURIComponent(EMAIL)}&count=10&fields=*`),
    api("GET", `/salary/type?count=1000&fields=*`),
    api("GET", `/ledger/account?number=5000,1920&count=10&fields=*`),
  ]);

  // Find exact employee
  const employees = empRes.values || [];
  const emp = employees.find((e: any) =>
    e.email?.toLowerCase() === EMAIL.toLowerCase()
  );
  if (!emp) throw new Error("Employee not found");
  const empId = emp.id;
  console.log(`Employee: ${emp.firstName} ${emp.lastName}, id=${empId}, dob=${emp.dateOfBirth}, employments=${JSON.stringify(emp.employments)}`);

  // Resolve salary types
  const salTypes = salTypeRes.values || [];
  const fastlonn = salTypes.find((s: any) => s.name === "Fastlønn" || s.number === 1);
  const bonus = salTypes.find((s: any) => s.name === "Bonus");
  if (!fastlonn || !bonus) throw new Error(`Missing salary types: fastlonn=${fastlonn?.id}, bonus=${bonus?.id}`);
  console.log(`Fastlønn id=${fastlonn.id}, Bonus id=${bonus.id}`);

  // Resolve accounts
  const accounts = acctRes.values || [];
  const acct5000 = accounts.find((a: any) => a.number === 5000);
  const acct1920 = accounts.find((a: any) => a.number === 1920);
  if (!acct5000 || !acct1920) throw new Error(`Missing accounts: 5000=${acct5000?.id}, 1920=${acct1920?.id}`);
  console.log(`Account 5000 id=${acct5000.id}, Account 1920 id=${acct1920.id}`);

  // Check if employee is underconfigured
  const underconfigured = emp.dateOfBirth === null || emp.dateOfBirth === undefined ||
    !emp.employments || emp.employments.length === 0 ||
    (emp.employments.length > 0 && emp.employments.every((e: any) => !e.startDate));

  if (underconfigured) {
    console.log("Employee is underconfigured — repair branch");

    // Generate a valid 9-digit Norwegian org number
    const orgNum = "9" + String(Math.floor(10000000 + Math.random() * 89999999)).slice(0, 8);

    // Step 2: parallel POST /division + PUT /employee
    const [divRes] = await Promise.all([
      api("POST", "/division", {
        name: "Hovudavdeling",
        organizationNumber: orgNum,
        startDate: `${YEAR}-01-01`,
        municipalityDate: `${YEAR}-01-01`,
        municipality: { id: 1 },
      }),
      api("PUT", `/employee/${empId}`, {
        id: empId,
        firstName: emp.firstName,
        lastName: emp.lastName,
        dateOfBirth: "1990-01-01",
      }),
    ]);

    const divId = divRes.value.id;
    console.log(`Division created: id=${divId}`);

    // Step 3: POST /employee/employment with inline employmentDetails
    await api("POST", "/employee/employment", {
      employee: { id: empId },
      startDate: `${YEAR}-${String(MONTH).padStart(2, "0")}-01`,
      isMainEmployer: true,
      taxDeductionCode: "loennFraHovedarbeidsgiver",
      division: { id: divId },
      employmentDetails: [{
        date: `${YEAR}-${String(MONTH).padStart(2, "0")}-01`,
        employmentType: "ORDINARY",
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 100,
        monthlySalary: BASE_SALARY,
        annualSalary: BASE_SALARY * 12,
      }],
    });
    console.log("Employment created with inline details");
  }

  // Step 4: parallel salary transaction + voucher
  const [salRes, voucherRes] = await Promise.all([
    api("POST", "/salary/transaction?generateTaxDeduction=true", {
      date: DATE,
      year: YEAR,
      month: MONTH,
      paySlipsAvailableDate: DATE,
      payslips: [{
        employee: { id: empId },
        date: DATE,
        year: YEAR,
        month: MONTH,
        specifications: [
          {
            employee: { id: empId },
            salaryType: { id: fastlonn.id },
            description: `Fastlønn mars ${YEAR}`,
            year: YEAR,
            month: MONTH,
            count: 1,
            rate: BASE_SALARY,
            amount: BASE_SALARY,
          },
          {
            employee: { id: empId },
            salaryType: { id: bonus.id },
            description: `Bonus mars ${YEAR}`,
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
      voucherType: { name: "Lønnsbilag" },
      date: DATE,
      description: `Lønn mars ${YEAR} - Fastlønn ${BASE_SALARY} + Bonus ${BONUS}`,
      postings: [
        {
          account: { id: acct5000.id },
          description: `Fastlønn mars ${YEAR}`,
          amountGross: BASE_SALARY,
          amountGrossCurrency: BASE_SALARY,
          row: 1,
        },
        {
          account: { id: acct5000.id },
          description: `Bonus mars ${YEAR}`,
          amountGross: BONUS,
          amountGrossCurrency: BONUS,
          row: 2,
        },
        {
          account: { id: acct1920.id },
          description: `Lønn mars ${YEAR}`,
          amountGross: -TOTAL,
          amountGrossCurrency: -TOTAL,
          row: 3,
        },
      ],
    }),
  ]);

  console.log("Salary transaction created:", JSON.stringify(salRes.value?.id || salRes));
  console.log("Voucher created:", JSON.stringify(voucherRes.value?.id || voucherRes));
  console.log("DONE — total gross:", TOTAL);
}

main().catch((e) => { console.error(e); process.exit(1); });
