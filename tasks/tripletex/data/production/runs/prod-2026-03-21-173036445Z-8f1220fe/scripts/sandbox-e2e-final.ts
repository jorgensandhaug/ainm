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
  console.log(`${method} ${path} => ${res.status}`);
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
  // The employee created in prior test: id=18643223, email=proof-*@example.org
  // Let me just use this existing underconfigured employee
  const EMP_ID = 18643223;

  console.log("=== Verify employee is underconfigured ===");
  const empCheck = await api("GET", `/employee/${EMP_ID}?fields=*`);
  const emp = empCheck.data?.value;
  console.log(`ID: ${emp?.id}, DOB: ${emp?.dateOfBirth}, Employments: ${JSON.stringify(emp?.employments)}`);

  if (emp?.dateOfBirth !== null || (emp?.employments && emp.employments.length > 0)) {
    console.log("Employee is not underconfigured, already repaired");
    return;
  }

  console.log("\n========== SIMULATED PRODUCTION FLOW ==========\n");
  let calls = 0;

  // Call 1: GET employee (simulated - already done above)
  calls++;
  console.log(`[${calls}] GET employee => underconfigured`);

  // Call 2: GET division => simulate zero rows
  calls++;
  console.log(`\n[${calls}] GET division => zero rows (simulated, creating fresh)`);

  // Call 3: GET municipality
  calls++;
  console.log(`\n[${calls}] GET municipality`);
  const munRes = await api("GET", "/municipality?count=1&fields=*");
  const munId = munRes.data?.values?.[0]?.id;
  console.log("Municipality ID:", munId);

  // Call 4: POST division
  calls++;
  const orgNum = generateNorwegianOrgNumber();
  console.log(`\n[${calls}] POST division (orgNum=${orgNum})`);
  const divRes = await api("POST", "/division", {
    name: "Hovudavdeling",
    organizationNumber: orgNum,
    startDate: "2026-01-01",
    municipalityDate: "2026-01-01",
    municipality: { id: munId },
  });
  const divisionId = divRes.data?.value?.id;
  console.log("Division ID:", divisionId);
  if (!divisionId) { console.log("BLOCKED"); return; }

  // Call 5: GET salary types
  calls++;
  console.log(`\n[${calls}] GET salary/type`);
  const stRes = await api("GET", "/salary/type?count=1000&fields=*");
  const salaryTypes = stRes.data?.values || [];
  const fastlonn = salaryTypes.find((t: any) => t.name === "Fastlønn");
  const bonus = salaryTypes.find((t: any) => t.name === "Bonus");
  console.log("Fastlønn:", fastlonn?.id, "Bonus:", bonus?.id);
  if (!fastlonn || !bonus) return;

  // Call 6: PUT employee DOB
  calls++;
  console.log(`\n[${calls}] PUT employee DOB`);
  const putRes = await api("PUT", `/employee/${EMP_ID}`, {
    ...emp,
    dateOfBirth: "1990-01-01",
  });
  console.log("Status:", putRes.status);

  // Call 7: POST employment
  calls++;
  console.log(`\n[${calls}] POST employment`);
  const emplRes = await api("POST", "/employee/employment", {
    employee: { id: EMP_ID },
    division: { id: divisionId },
    startDate: "2026-03-01",
    isMainEmployer: true,
    taxDeductionCode: "loennFraHovedarbeidsgiver",
  });
  console.log("Status:", emplRes.status, "ID:", emplRes.data?.value?.id);
  if (emplRes.status !== 201 && emplRes.status !== 200) return;

  // Call 8: POST salary transaction
  calls++;
  console.log(`\n[${calls}] POST salary/transaction`);
  const txRes = await api("POST", "/salary/transaction", {
    date: "2026-03-21",
    year: 2026,
    month: 3,
    paySlipsAvailableDate: "2026-03-21",
    payslips: [{
      employee: { id: EMP_ID },
      date: "2026-03-21",
      year: 2026,
      month: 3,
      specifications: [
        {
          employee: { id: EMP_ID },
          salaryType: { id: fastlonn.id },
          description: "Fastlønn mars 2026",
          year: 2026,
          month: 3,
          count: 1,
          rate: 36000,
          amount: 36000,
        },
        {
          employee: { id: EMP_ID },
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

    // Call 9: Verify
    calls++;
    console.log(`\n[${calls}] GET salary/transaction`);
    const verifyTx = await api("GET", `/salary/transaction/${txId}?fields=*`);
    const payslipId = verifyTx.data?.value?.payslips?.[0]?.id;

    if (payslipId) {
      calls++;
      console.log(`\n[${calls}] GET salary/payslip`);
      const verifyPs = await api("GET", `/salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`);
      const ps = verifyPs.data?.value;
      console.log("\n=== PAYSLIP PROOF ===");
      console.log("grossAmount:", ps?.grossAmount);
      console.log("amount:", ps?.amount);
      for (const s of (ps?.specifications || [])) {
        console.log(`  ${s.salaryType?.name}: ${s.amount}`);
      }
    }
  } else {
    console.log("FAILED!");
  }

  console.log(`\n=== TOTAL CALLS: ${calls} ===`);
}

main().catch(console.error);
