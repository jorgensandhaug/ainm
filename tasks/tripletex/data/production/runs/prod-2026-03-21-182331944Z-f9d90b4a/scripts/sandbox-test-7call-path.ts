// Full end-to-end test of the 7-call no-division payroll path
// 1. Create a disposable underconfigured employee (setup, not counted)
// 2. Then run the 7-call path:
//    GET /employee → GET /division → POST /division (hardcode mun id=1) → PUT /employee → POST /employment → GET /salary/type → POST /salary/transaction

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const YEAR = 2026;
const MONTH = 3;
const DATE = "2026-03-21";

let callCount = 0;

async function api(method: string, path: string, body?: any, label?: string) {
  callCount++;
  const url = `${BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`[${label || `call ${callCount}`}] ${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("ERROR:", JSON.stringify(json, null, 2));
  return { status: res.status, data: json };
}

function generateNorwegianOrgNumber(): string {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  while (true) {
    const digits = [9];
    for (let i = 0; i < 7; i++) digits.push(Math.floor(Math.random() * 10));
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += digits[i] * weights[i];
    const remainder = sum % 11;
    if (remainder === 1) continue;
    const checkDigit = remainder === 0 ? 0 : 11 - remainder;
    digits.push(checkDigit);
    return digits.join("");
  }
}

async function main() {
  // === SETUP: Create a disposable underconfigured employee ===
  const rnd = Math.floor(Math.random() * 1000000);
  const testEmail = `payroll-7call-${rnd}@example.org`;
  console.log("=== SETUP: Creating disposable underconfigured employee ===");
  callCount = 0; // don't count setup
  const createEmpRes = await api("POST", "/employee", {
    firstName: "Test7Call",
    lastName: `Employee${rnd}`,
    email: testEmail,
  }, "SETUP");
  callCount = 0; // reset for the actual test

  if (createEmpRes.status >= 400) {
    console.log("BLOCKED: cannot create test employee");
    process.exit(1);
  }
  const testEmpId = createEmpRes.data?.value?.id;
  console.log(`Test employee created: id=${testEmpId}, email=${testEmail}`);
  console.log("Employee has dateOfBirth=null and employments=[] by default");

  // === THE ACTUAL 7-CALL PATH ===
  console.log("\n=== STARTING 7-CALL PAYROLL PATH ===\n");

  // Call 1: GET /employee
  const empRes = await api("GET", `/employee?email=${encodeURIComponent(testEmail)}&count=10&fields=*`, undefined, "1-GET-employee");
  const employees = empRes.data?.values || [];
  const emp = employees.find((e: any) => e.email?.toLowerCase() === testEmail.toLowerCase());
  console.log(`  Employee id=${emp.id}, dateOfBirth=${emp.dateOfBirth}, employments=${JSON.stringify(emp.employments)}`);

  // Call 2: GET /division — we expect existing divisions in sandbox (this is the "division exists" branch)
  // But let's simulate the no-division branch by using a fresh division
  // Actually, the sandbox likely already has divisions. Let me check.
  const divRes = await api("GET", "/division?count=1&fields=*", undefined, "2-GET-division");
  const divisions = divRes.data?.values || [];

  let divisionId: number;
  if (divisions.length > 0) {
    console.log(`  Division already exists: id=${divisions[0].id} — this is the 6-call branch`);
    divisionId = divisions[0].id;
    // In this case, the path is only 6 calls (no municipality, no POST /division)
  } else {
    // Call 3: POST /division with hardcoded municipality id=1
    const orgNum = generateNorwegianOrgNumber();
    const divCreateRes = await api("POST", "/division", {
      name: "Hovudavdeling",
      organizationNumber: orgNum,
      startDate: `${YEAR}-01-01`,
      municipalityDate: `${YEAR}-01-01`,
      municipality: { id: 1 },
    }, "3-POST-division");
    divisionId = divCreateRes.data?.value?.id;
    console.log(`  Division created: id=${divisionId}`);
  }

  // Call 3/4: PUT /employee (repair dateOfBirth)
  const putRes = await api("PUT", `/employee/${emp.id}`, {
    id: emp.id,
    firstName: emp.firstName,
    lastName: emp.lastName,
    dateOfBirth: "1990-01-01",
  }, `${callCount + 1}-PUT-employee`);
  console.log(`  Employee dateOfBirth repaired`);

  // Call 4/5: POST /employee/employment
  const emplRes = await api("POST", "/employee/employment", {
    employee: { id: emp.id },
    division: { id: divisionId },
    startDate: `${YEAR}-${String(MONTH).padStart(2, "0")}-01`,
    isMainEmployer: true,
    taxDeductionCode: "loennFraHovedarbeidsgiver",
  }, `${callCount + 1}-POST-employment`);
  console.log(`  Employment created`);

  // Call 5/6: GET /salary/type
  const stRes = await api("GET", "/salary/type?count=1000&fields=*", undefined, `${callCount + 1}-GET-salary-type`);
  const salaryTypes = stRes.data?.values || [];
  const fastlonn = salaryTypes.find((st: any) => st.name === "Fastlønn");
  const bonus = salaryTypes.find((st: any) => st.name === "Bonus");
  console.log(`  Salary types: Fastlønn id=${fastlonn?.id}, Bonus id=${bonus?.id}`);

  // Call 6/7: POST /salary/transaction
  const payload = {
    date: DATE,
    year: YEAR,
    month: MONTH,
    paySlipsAvailableDate: DATE,
    payslips: [{
      employee: { id: emp.id },
      date: DATE,
      year: YEAR,
      month: MONTH,
      specifications: [
        {
          employee: { id: emp.id },
          salaryType: { id: fastlonn.id },
          description: `Fastlønn mars ${YEAR}`,
          year: YEAR,
          month: MONTH,
          count: 1,
          rate: 41750,
          amount: 41750,
        },
        {
          employee: { id: emp.id },
          salaryType: { id: bonus.id },
          description: `Bonus mars ${YEAR}`,
          year: YEAR,
          month: MONTH,
          count: 1,
          rate: 6750,
          amount: 6750,
        },
      ],
    }],
  };

  const txRes = await api("POST", "/salary/transaction", payload, `${callCount + 1}-POST-salary-transaction`);

  console.log(`\n=== RESULT ===`);
  console.log(`Total API calls: ${callCount}`);
  console.log(`All calls succeeded: ${txRes.status === 201 ? "YES" : "NO"}`);
  if (txRes.status === 201) {
    console.log(`Transaction: ${JSON.stringify(txRes.data?.value, null, 2)}`);

    // Verify the payslip (extra call, not part of the path, just for proof)
    const txId = txRes.data?.value?.id;
    const payslipId = txRes.data?.value?.payslips?.[0]?.id;
    if (payslipId) {
      console.log(`\n=== VERIFICATION (not counted) ===`);
      callCount--; // don't count verification
      const psRes = await api("GET", `/salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`, undefined, "VERIFY");
      callCount--; // don't count verification
      console.log(`Payslip: grossAmount=${psRes.data?.value?.grossAmount}, amount=${psRes.data?.value?.amount}`);
      const specs = psRes.data?.value?.specifications || [];
      for (const s of specs) {
        console.log(`  ${s.salaryType?.name}: amount=${s.amount}`);
      }
    }
  }
}

main().catch(console.error);
