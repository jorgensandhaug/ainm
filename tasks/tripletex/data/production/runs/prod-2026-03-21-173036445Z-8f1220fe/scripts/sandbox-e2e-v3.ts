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
  // First, create employee with department (sandbox needs it)
  console.log("=== SETUP: Create underconfigured employee ===");
  const uid = Math.random().toString(36).slice(2, 8);
  const EMAIL = `proof-${uid}@example.org`;

  // Need a department for the sandbox
  const deptRes = await api("GET", "/department?count=1&fields=*");
  let deptId: number | undefined;
  if (deptRes.data?.values?.length > 0) {
    deptId = deptRes.data.values[0].id;
    console.log("Dept:", deptId);
  }

  const setupEmp = await api("POST", "/employee", {
    firstName: "ProofDiv",
    lastName: uid,
    email: EMAIL,
    ...(deptId ? { department: { id: deptId } } : {}),
  });
  if (setupEmp.status !== 201 && setupEmp.status !== 200) {
    console.log("Cannot create employee");
    return;
  }
  const setupData = setupEmp.data?.value;
  console.log("Employee:", setupData?.id, "dob:", setupData?.dateOfBirth, "employments:", JSON.stringify(setupData?.employments));

  console.log("\n========================================");
  console.log("=== SIMULATED PRODUCTION RUN START ===");
  console.log("========================================\n");
  let totalCalls = 0;

  // Call 1: GET employee
  totalCalls++;
  console.log(`[Call ${totalCalls}] Find employee`);
  const empRes = await api("GET", `/employee?email=${encodeURIComponent(EMAIL)}&count=10&fields=*`);
  const emp = empRes.data?.values?.find((e: any) => e.email?.toLowerCase() === EMAIL.toLowerCase());
  if (!emp) { console.log("Employee not found!"); return; }
  console.log(`Employee: id=${emp.id}, dob=${emp.dateOfBirth}, employments=${JSON.stringify(emp.employments)}`);
  const underconfigured = emp.dateOfBirth === null && (!emp.employments || emp.employments.length === 0);
  console.log("Underconfigured:", underconfigured);

  // Call 2: GET division (in production this would return 0)
  totalCalls++;
  console.log(`\n[Call ${totalCalls}] Check divisions`);
  // Use the newly created division from the previous test
  // But for this e2e proof, I'll create a fresh one
  const orgNum = generateNorwegianOrgNumber();

  // Call 3: GET municipality
  totalCalls++;
  console.log(`\n[Call ${totalCalls}] Get municipality`);
  const munRes = await api("GET", "/municipality?count=1&fields=*");
  const munId = munRes.data?.values?.[0]?.id;
  console.log("Municipality:", munId);

  // Call 4: POST division
  totalCalls++;
  console.log(`\n[Call ${totalCalls}] Create division orgNum=${orgNum}`);
  const divCreate = await api("POST", "/division", {
    name: `Payroll Division ${uid}`,
    organizationNumber: orgNum,
    startDate: "2026-01-01",
    municipalityDate: "2026-01-01",
    municipality: { id: munId },
  });
  const divisionId = divCreate.data?.value?.id;
  console.log("Division:", divisionId);
  if (!divisionId) return;

  // Call 5: PUT employee DOB
  totalCalls++;
  console.log(`\n[Call ${totalCalls}] Repair DOB`);
  const putRes = await api("PUT", `/employee/${emp.id}`, {
    ...emp,
    dateOfBirth: "1990-01-01",
  });
  console.log("DOB:", putRes.status);

  // Call 6: POST employment
  totalCalls++;
  console.log(`\n[Call ${totalCalls}] Create employment`);
  const emplRes = await api("POST", "/employee/employment", {
    employee: { id: emp.id },
    division: { id: divisionId },
    startDate: "2026-03-01",
    isMainEmployer: true,
    taxDeductionCode: "loennFraHovedarbeidsgiver",
  });
  console.log("Employment:", emplRes.status, emplRes.data?.value?.id);
  if (emplRes.status !== 201 && emplRes.status !== 200) return;

  // Call 7: GET salary types
  totalCalls++;
  console.log(`\n[Call ${totalCalls}] Salary types`);
  const stRes = await api("GET", "/salary/type?count=1000&fields=*");
  const salaryTypes = stRes.data?.values || [];
  const fastlonn = salaryTypes.find((t: any) => t.name === "Fastlønn");
  const bonus = salaryTypes.find((t: any) => t.name === "Bonus");
  console.log("Fastlønn:", fastlonn?.id, "Bonus:", bonus?.id);
  if (!fastlonn || !bonus) return;

  // Call 8: POST salary transaction
  totalCalls++;
  console.log(`\n[Call ${totalCalls}] Create salary transaction`);
  const txRes = await api("POST", "/salary/transaction", {
    date: "2026-03-21",
    year: 2026,
    month: 3,
    paySlipsAvailableDate: "2026-03-21",
    payslips: [{
      employee: { id: emp.id },
      date: "2026-03-21",
      year: 2026,
      month: 3,
      specifications: [
        {
          employee: { id: emp.id },
          salaryType: { id: fastlonn.id },
          description: "Fastlønn mars 2026",
          year: 2026,
          month: 3,
          count: 1,
          rate: 36000,
          amount: 36000,
        },
        {
          employee: { id: emp.id },
          salaryType: { id: bonus.id },
          description: "Bonus mars 2026",
          year: 2026,
          month: 3,
          count: 1,
          rate: 15400,
          amount: 15400,
        },
      ],
    }],
  });

  if (txRes.status === 201 || txRes.status === 200) {
    const txId = txRes.data?.value?.id;
    console.log("TX ID:", txId);

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
      console.log("Gross:", ps?.grossAmount, "Net:", ps?.amount);
      for (const s of (ps?.specifications || [])) {
        console.log(`  ${s.salaryType?.name}: amount=${s.amount}`);
      }
    }
  } else {
    console.log("SALARY TX FAILED!");
  }

  console.log(`\n=== TOTAL CALLS: ${totalCalls} ===`);
}

main().catch(console.error);
