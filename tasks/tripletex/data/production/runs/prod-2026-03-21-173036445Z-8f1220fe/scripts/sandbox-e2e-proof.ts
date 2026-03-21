const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`\n${method} ${path} => ${res.status}`);
  if (!res.ok) console.log("ERROR:", JSON.stringify(json, null, 2));
  return { status: res.status, data: json };
}

function generateNorwegianOrgNumber(): string {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  let digits = [9];
  for (let i = 1; i < 8; i++) {
    digits.push(Math.floor(Math.random() * 10));
  }
  const sum = digits.reduce((acc, d, i) => acc + d * weights[i], 0);
  const remainder = sum % 11;
  if (remainder === 0) digits.push(0);
  else if (remainder === 1) return generateNorwegianOrgNumber();
  else digits.push(11 - remainder);
  return digits.join('');
}

async function main() {
  const EMAIL = `e2e-proof-${Date.now()}@example.org`;
  const YEAR = 2026;
  const MONTH = 3;
  const DATE = "2026-03-21";
  const BASE_SALARY = 36000;
  const BONUS = 15400;
  let totalCalls = 0;

  // Step 0: Create a disposable underconfigured employee (NOT counted - this simulates the pre-existing state)
  console.log("=== SETUP: Create underconfigured employee ===");
  const setupEmp = await api("POST", "/employee", {
    firstName: "E2E",
    lastName: "Proof",
    email: EMAIL,
  });
  const empId = setupEmp.data?.value?.id;
  console.log("Setup employee:", empId, "email:", EMAIL);

  console.log("\n========================================");
  console.log("=== SIMULATED PRODUCTION RUN START ===");
  console.log("========================================\n");

  // Call 1: GET employee
  totalCalls++;
  console.log(`[Call ${totalCalls}] Find employee`);
  const empRes = await api("GET", `/employee?email=${encodeURIComponent(EMAIL)}&count=10&fields=*`);
  const emp = empRes.data?.values?.find((e: any) => e.email?.toLowerCase() === EMAIL.toLowerCase());
  console.log(`Employee: id=${emp.id}, dob=${emp.dateOfBirth}, employments=${emp.employments?.length}`);

  const underconfigured = emp.dateOfBirth === null && (!emp.employments || emp.employments.length === 0);
  console.log("Underconfigured:", underconfigured);

  // Call 2: GET division
  totalCalls++;
  console.log(`\n[Call ${totalCalls}] Check divisions`);
  const divRes = await api("GET", "/division?count=1&fields=*");
  const existingDivs = divRes.data?.values || [];

  let divisionId: number;
  if (existingDivs.length > 0) {
    divisionId = existingDivs[0].id;
    console.log("Existing division found:", divisionId);
  } else {
    // NO DIVISION - new rescue path!
    console.log("No division! Creating one...");

    // Call 3: GET municipality
    totalCalls++;
    console.log(`\n[Call ${totalCalls}] Get municipality`);
    const munRes = await api("GET", "/municipality?count=1&fields=*");
    const munId = munRes.data?.values?.[0]?.id;
    console.log("Municipality:", munId);

    // Call 4: POST division
    totalCalls++;
    const orgNum = generateNorwegianOrgNumber();
    console.log(`\n[Call ${totalCalls}] Create division with orgNum=${orgNum}`);
    const divCreate = await api("POST", "/division", {
      name: "Hovudavdeling",
      organizationNumber: orgNum,
      startDate: `${YEAR}-01-01`,
      municipalityDate: `${YEAR}-01-01`,
      municipality: { id: munId },
    });
    divisionId = divCreate.data?.value?.id;
    console.log("Created division:", divisionId);
  }

  // Call 5: PUT employee DOB
  totalCalls++;
  console.log(`\n[Call ${totalCalls}] Repair employee DOB`);
  const putRes = await api("PUT", `/employee/${emp.id}`, {
    ...emp,
    dateOfBirth: "1990-01-01",
  });
  console.log("DOB repair:", putRes.status);

  // Call 6: POST employment
  totalCalls++;
  console.log(`\n[Call ${totalCalls}] Create employment`);
  const emplRes = await api("POST", "/employee/employment", {
    employee: { id: emp.id },
    division: { id: divisionId },
    startDate: `${YEAR}-${String(MONTH).padStart(2, '0')}-01`,
    isMainEmployer: true,
    taxDeductionCode: "loennFraHovedarbeidsgiver",
  });
  console.log("Employment:", emplRes.status, "id:", emplRes.data?.value?.id);

  // Call 7: GET salary types
  totalCalls++;
  console.log(`\n[Call ${totalCalls}] Get salary types`);
  const stRes = await api("GET", "/salary/type?count=1000&fields=*");
  const salaryTypes = stRes.data?.values || [];
  const fastlonn = salaryTypes.find((t: any) => t.name === "Fastlønn");
  const bonus = salaryTypes.find((t: any) => t.name === "Bonus");
  console.log("Fastlønn:", fastlonn?.id, "Bonus:", bonus?.id);

  // Call 8: POST salary transaction
  totalCalls++;
  console.log(`\n[Call ${totalCalls}] Create salary transaction`);
  const txRes = await api("POST", "/salary/transaction", {
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
          salaryType: { id: fastlonn!.id },
          description: `Fastlønn mars ${YEAR}`,
          year: YEAR,
          month: MONTH,
          count: 1,
          rate: BASE_SALARY,
          amount: BASE_SALARY,
        },
        {
          employee: { id: emp.id },
          salaryType: { id: bonus!.id },
          description: `Bonus mars ${YEAR}`,
          year: YEAR,
          month: MONTH,
          count: 1,
          rate: BONUS,
          amount: BONUS,
        },
      ],
    }],
  });

  if (txRes.status === 201 || txRes.status === 200) {
    const txId = txRes.data?.value?.id;
    console.log("\nSalary transaction created:", txId);

    // Verification (optional, only if write response is sparse)
    totalCalls++;
    console.log(`\n[Call ${totalCalls}] Verify transaction`);
    const verifyTx = await api("GET", `/salary/transaction/${txId}?fields=*`);
    const payslipId = verifyTx.data?.value?.payslips?.[0]?.id;

    if (payslipId) {
      totalCalls++;
      console.log(`\n[Call ${totalCalls}] Verify payslip`);
      const verifyPs = await api("GET", `/salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`);
      const ps = verifyPs.data?.value;
      console.log("\n=== PAYSLIP VERIFICATION ===");
      console.log("Gross amount:", ps?.grossAmount);
      console.log("Amount:", ps?.amount);
      const specs = ps?.specifications || [];
      for (const s of specs) {
        console.log(`  ${s.salaryType?.name}: amount=${s.amount}, rate=${s.rate}`);
      }
    }
  } else {
    console.log("SALARY TRANSACTION FAILED!");
  }

  console.log(`\n========================================`);
  console.log(`TOTAL API CALLS: ${totalCalls}`);
  console.log(`========================================`);
}

main().catch(console.error);
