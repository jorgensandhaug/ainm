const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "vptL7BfzjsRy5djzjhjwWt4rvXDut7wmN_c7k6-bO6g";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const EMAIL = "beatriz.pereira@example.org";
const BASE_SALARY = 58650;
const BONUS = 8850;
const GROSS = BASE_SALARY + BONUS; // 67500
const YEAR = 2026;
const MONTH = 3;
const PERIOD_START = "2026-03-01";

let callCount = 0;
let errorCount = 0;

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
    errorCount++;
    console.error(`  ERROR ${r.status}:`, JSON.stringify(data).slice(0, 500));
    throw new Error(`${r.status} on ${method} ${path}`);
  }
  console.log(`  OK ${r.status}`);
  return data;
}

// Generate valid Norwegian 9-digit org number
function generateOrgNumber(): string {
  while (true) {
    const digits = [9];
    for (let i = 0; i < 7; i++) digits.push(Math.floor(Math.random() * 10));
    const weights = [3, 2, 7, 6, 5, 4, 3, 2];
    const sum = digits.reduce((s, d, i) => s + d * weights[i], 0);
    const remainder = 11 - (sum % 11);
    if (remainder === 10) continue; // invalid
    const check = remainder === 11 ? 0 : remainder;
    digits.push(check);
    return digits.join("");
  }
}

async function main() {
  // Step 1: Find employee
  const empRes = await api("GET", `/employee?email=${EMAIL}&count=10&fields=*`);
  const employees = empRes.values || [];
  const emp = employees.find((e: any) => e.email === EMAIL);
  if (!emp) throw new Error("Employee not found");
  console.log(`  Employee id=${emp.id}, name=${emp.firstName} ${emp.lastName}, dob=${emp.dateOfBirth}, employments=${JSON.stringify(emp.employments)}`);

  const underconfigured = emp.dateOfBirth === null && (!emp.employments || emp.employments.length === 0);
  let needEmploymentCheck = false;

  if (!underconfigured) {
    // Check if employments are sparse stubs
    if (emp.employments && emp.employments.length > 0) {
      const hasFullData = emp.employments.some((e: any) => e.startDate && e.division);
      if (!hasFullData) needEmploymentCheck = true;
    }
  }

  if (underconfigured) {
    console.log("  Employee is underconfigured, entering repair branch");

    // Step 4: GET /division before salary-type lookup
    const divRes = await api("GET", "/division?count=1&fields=*");
    const divisions = divRes.values || [];

    let divisionId: number;

    if (divisions.length === 0) {
      console.log("  No division found, creating one");
      const orgNum = generateOrgNumber();
      const divCreateRes = await api("POST", "/division", {
        name: "Hovudavdeling",
        organizationNumber: orgNum,
        startDate: "2026-01-01",
        municipalityDate: "2026-01-01",
        municipality: { id: 1 }
      });
      divisionId = divCreateRes.value.id;
      console.log(`  Created division id=${divisionId}`);
    } else {
      divisionId = divisions[0].id;
      console.log(`  Using existing division id=${divisionId}`);
    }

    // Repair employee: PUT dateOfBirth
    await api("PUT", `/employee/${emp.id}`, {
      id: emp.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      email: emp.email,
      dateOfBirth: "1990-01-01"
    });
    console.log("  Set dateOfBirth=1990-01-01");

    // Create employment
    const emplRes = await api("POST", "/employee/employment", {
      employee: { id: emp.id },
      division: { id: divisionId },
      startDate: PERIOD_START,
      isMainEmployer: true,
      taxDeductionCode: "loennFraHovedarbeidsgiver"
    });
    const employmentId = emplRes.value.id;
    console.log(`  Created employment id=${employmentId}`);

    // Create employment details
    await api("POST", "/employee/employment/details", {
      employment: { id: employmentId },
      date: PERIOD_START,
      employmentType: "ORDINARY",
      employmentForm: "PERMANENT",
      remunerationType: "MONTHLY_WAGE",
      workingHoursScheme: "NOT_SHIFT",
      percentageOfFullTimeEquivalent: 100,
      monthlySalary: BASE_SALARY,
      annualSalary: BASE_SALARY * 12
    });
    console.log(`  Created employment details with monthlySalary=${BASE_SALARY}`);
  } else if (needEmploymentCheck) {
    // Conditional employment read
    const emplRes = await api("GET", `/employee/employment?employeeId=${emp.id}&count=20&fields=*`);
    console.log(`  Employment details:`, JSON.stringify(emplRes.values?.map((e: any) => ({ id: e.id, start: e.startDate, end: e.endDate, div: e.division?.id }))));
  }

  // Step 7: Parallel reads - salary types + voucherType + accounts
  const [salaryTypeRes, voucherTypeRes, accountRes] = await Promise.all([
    api("GET", "/salary/type?count=1000&fields=*"),
    api("GET", "/ledger/voucherType?name=L%C3%B8nnsbilag&count=1&fields=*"),
    api("GET", "/ledger/account?number=5000,1920&count=10&fields=*")
  ]);

  const salaryTypes = salaryTypeRes.values || [];
  const fastlonn = salaryTypes.find((t: any) => t.name === "Fastlønn");
  const bonus = salaryTypes.find((t: any) => t.name === "Bonus");
  if (!fastlonn || !bonus) throw new Error(`Missing salary types: Fastlønn=${fastlonn?.id}, Bonus=${bonus?.id}`);
  console.log(`  Fastlønn id=${fastlonn.id}, Bonus id=${bonus.id}`);

  const voucherTypes = voucherTypeRes.values || [];
  if (voucherTypes.length === 0) throw new Error("No Lønnsbilag voucherType found");
  const lonnsbilagId = voucherTypes[0].id;
  console.log(`  Lønnsbilag voucherType id=${lonnsbilagId}`);

  const accounts = accountRes.values || [];
  const acc5000 = accounts.find((a: any) => a.number === 5000);
  const acc1920 = accounts.find((a: any) => a.number === 1920);
  if (!acc5000 || !acc1920) throw new Error(`Missing accounts: 5000=${acc5000?.id}, 1920=${acc1920?.id}`);
  console.log(`  Account 5000 id=${acc5000.id}, Account 1920 id=${acc1920.id}`);

  // Step 8: POST salary transaction
  const txRes = await api("POST", "/salary/transaction?generateTaxDeduction=true", {
    date: PERIOD_START,
    year: YEAR,
    month: MONTH,
    paySlipsAvailableDate: PERIOD_START,
    payslips: [{
      employee: { id: emp.id },
      date: PERIOD_START,
      year: YEAR,
      month: MONTH,
      specifications: [
        {
          employee: { id: emp.id },
          salaryType: { id: fastlonn.id },
          description: "Fastlønn",
          year: YEAR,
          month: MONTH,
          count: 1,
          rate: BASE_SALARY,
          amount: BASE_SALARY
        },
        {
          employee: { id: emp.id },
          salaryType: { id: bonus.id },
          description: "Bonus",
          year: YEAR,
          month: MONTH,
          count: 1,
          rate: BONUS,
          amount: BONUS
        }
      ]
    }]
  });
  console.log(`  Salary transaction created: id=${txRes.value?.id}`);

  // Step 9: Create Lønnsbilag voucher
  const voucherRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: PERIOD_START,
    description: `Lønn mars 2026 - Fastlønn ${BASE_SALARY} + Bonus ${BONUS}`,
    voucherType: { id: lonnsbilagId },
    postings: [
      {
        row: 1,
        date: PERIOD_START,
        description: `Fastlønn ${BASE_SALARY}`,
        account: { id: acc5000.id },
        amount: BASE_SALARY,
        amountCurrency: BASE_SALARY,
        amountGross: BASE_SALARY,
        amountGrossCurrency: BASE_SALARY
      },
      {
        row: 2,
        date: PERIOD_START,
        description: `Bonus ${BONUS}`,
        account: { id: acc5000.id },
        amount: BONUS,
        amountCurrency: BONUS,
        amountGross: BONUS,
        amountGrossCurrency: BONUS
      },
      {
        row: 3,
        date: PERIOD_START,
        description: `Utbetaling lønn mars 2026`,
        account: { id: acc1920.id },
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS
      }
    ]
  });
  console.log(`  Voucher created: id=${voucherRes.value?.id}, number=${voucherRes.value?.number}`);

  console.log(`\nDone. Total calls: ${callCount}, errors: ${errorCount}`);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
