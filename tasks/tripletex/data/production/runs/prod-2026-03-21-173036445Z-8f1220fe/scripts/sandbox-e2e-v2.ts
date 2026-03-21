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
  // Create a disposable employee using userType (sandbox requirement)
  console.log("=== SETUP: Create underconfigured employee ===");
  const uid = Math.random().toString(36).slice(2, 8);
  const EMAIL = `proof-${uid}@example.org`;
  const setupEmp = await api("POST", "/employee", {
    firstName: "ProofDiv",
    lastName: uid,
    email: EMAIL,
    userType: "STANDARD",
  });
  if (setupEmp.status !== 201 && setupEmp.status !== 200) {
    console.log("Cannot create employee, trying without userType");
    return;
  }
  const setupId = setupEmp.data?.value?.id;
  console.log("Created employee:", setupId, "dob:", setupEmp.data?.value?.dateOfBirth, "employments:", setupEmp.data?.value?.employments);

  // Verify it's underconfigured
  const empCheck = await api("GET", `/employee?email=${encodeURIComponent(EMAIL)}&count=10&fields=*`);
  const emp = empCheck.data?.values?.find((e: any) => e.email?.toLowerCase() === EMAIL.toLowerCase());
  if (!emp) { console.log("Employee not found after creation"); return; }
  console.log(`Verified: id=${emp.id}, dob=${emp.dateOfBirth}, employments=${JSON.stringify(emp.employments)}`);

  console.log("\n========================================");
  console.log("=== SIMULATED PRODUCTION RUN START ===");
  console.log("========================================\n");
  let totalCalls = 0;

  // Call 1: GET employee (already done above in setup verification - in real run this is the first call)
  totalCalls++;
  console.log(`[Call ${totalCalls}] Employee found: underconfigured`);

  // Call 2: GET division
  totalCalls++;
  console.log(`\n[Call ${totalCalls}] Check divisions`);
  // For this proof, let's simulate zero divisions by ignoring existing ones
  // In reality, we'd just use the first one. But the proof is about the CREATE path.
  // Let me just test the division creation flow directly.

  // Call 3: GET municipality
  totalCalls++;
  console.log(`\n[Call ${totalCalls}] Get municipality`);
  const munRes = await api("GET", "/municipality?count=1&fields=*");
  const munId = munRes.data?.values?.[0]?.id;
  console.log("Municipality:", munId);

  // Call 4: POST division (creating a new one even though sandbox has existing ones)
  totalCalls++;
  const orgNum = generateNorwegianOrgNumber();
  console.log(`\n[Call ${totalCalls}] Create division with orgNum=${orgNum}`);
  const divCreate = await api("POST", "/division", {
    name: `Hovudavdeling ${uid}`,
    organizationNumber: orgNum,
    startDate: "2026-01-01",
    municipalityDate: "2026-01-01",
    municipality: { id: munId },
  });
  const divisionId = divCreate.data?.value?.id;
  console.log("Created division:", divisionId);
  if (!divisionId) { console.log("Division creation failed!"); return; }

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
    startDate: "2026-03-01",
    isMainEmployer: true,
    taxDeductionCode: "loennFraHovedarbeidsgiver",
  });
  console.log("Employment:", emplRes.status, "id:", emplRes.data?.value?.id);
  if (emplRes.status !== 201 && emplRes.status !== 200) return;

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
          salaryType: { id: fastlonn!.id },
          description: "Fastlønn mars 2026",
          year: 2026,
          month: 3,
          count: 1,
          rate: 36000,
          amount: 36000,
        },
        {
          employee: { id: emp.id },
          salaryType: { id: bonus!.id },
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
    console.log("\nSalary transaction created:", txId);

    // Verification
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
