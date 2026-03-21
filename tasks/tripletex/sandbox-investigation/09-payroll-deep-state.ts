// Deep investigation of payroll state - what does a salary/transaction actually create?
// Check all salary-related endpoints for side effects
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("  ERROR:", JSON.stringify(json, null, 2).slice(0, 500));
  return { status: res.status, data: json };
}

async function main() {
  // Create a fresh employee, repair it, and create payroll
  const TS = Date.now();
  const EMAIL = `payroll-test-${TS}@example.org`;

  // 1. Create disposable employee
  const empRes = await api("POST", "/employee", {
    firstName: "Test",
    lastName: `Payroll${TS}`,
    email: EMAIL,
  });
  const empId = empRes.data?.value?.id;
  console.log("Employee:", empId);

  // 2. Get division
  const divRes = await api("GET", "/division?count=1&fields=*");
  let divisionId = divRes.data?.values?.[0]?.id;

  if (!divisionId) {
    // Create division
    const orgNum = "9" + String(Math.floor(10000000 + Math.random() * 90000000));
    const divCreate = await api("POST", "/division", {
      name: "Hovudavdeling",
      organizationNumber: orgNum,
      startDate: "2026-01-01",
      municipalityDate: "2026-01-01",
      municipality: { id: 1 },
    });
    divisionId = divCreate.data?.value?.id;
  }
  console.log("Division:", divisionId);

  // 3. Repair employee
  await api("PUT", `/employee/${empId}`, {
    id: empId,
    version: empRes.data?.value?.version,
    firstName: "Test",
    lastName: `Payroll${TS}`,
    email: EMAIL,
    dateOfBirth: "1990-01-01",
  });

  // 4. Create employment
  const emplRes = await api("POST", "/employee/employment", {
    employee: { id: empId },
    division: { id: divisionId },
    startDate: "2026-03-01",
    isMainEmployer: true,
    taxDeductionCode: "loennFraHovedarbeidsgiver",
  });
  console.log("Employment:", emplRes.data?.value?.id);

  // 5. Get salary types
  const stRes = await api("GET", "/salary/type?count=1000&fields=*");
  const fastlonn = stRes.data?.values?.find((t: any) => t.name === "Fastlønn" || t.description === "Fastlønn");
  const bonus = stRes.data?.values?.find((t: any) => t.name === "Bonus" || t.description === "Bonus");
  console.log("Fastlønn:", fastlonn?.id, "number:", fastlonn?.number, "name:", fastlonn?.name);
  console.log("Bonus:", bonus?.id, "number:", bonus?.number, "name:", bonus?.name);

  // 6. Create salary transaction
  const txRes = await api("POST", "/salary/transaction", {
    date: "2026-03-20",
    year: 2026,
    month: 3,
    paySlipsAvailableDate: "2026-03-20",
    payslips: [{
      employee: { id: empId },
      specifications: [
        { employee: { id: empId }, salaryType: { id: fastlonn?.id }, description: "Fastlønn", year: 2026, month: 3, count: 1, rate: 41750, amount: 41750 },
        { employee: { id: empId }, salaryType: { id: bonus?.id }, description: "Bonus", year: 2026, month: 3, count: 1, rate: 6750, amount: 6750 },
      ],
    }],
  });
  const txId = txRes.data?.value?.id;
  const payslipId = txRes.data?.value?.payslips?.[0]?.id;
  console.log("Transaction:", txId, "Payslip:", payslipId);
  console.log("Full TX response:", JSON.stringify(txRes.data, null, 2).slice(0, 1000));

  // 7. Now check ALL related state
  console.log("\n=== CHECKING ALL SALARY STATE ===\n");

  // Transaction detail
  const txDetail = await api("GET", `/salary/transaction/${txId}?fields=*`);
  console.log("Transaction detail:", JSON.stringify(txDetail.data?.value, null, 2).slice(0, 1000));

  // Payslip detail
  const psDetail = await api("GET", `/salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`);
  console.log("Payslip detail:", JSON.stringify(psDetail.data?.value, null, 2).slice(0, 2000));

  // Check if there's a salary/compilation endpoint
  const compRes = await api("GET", `/salary/compilation?employeeId=${empId}&year=2026&month=3&fields=*`);
  console.log("Compilation:", JSON.stringify(compRes.data, null, 2).slice(0, 500));

  // Check salary/settings
  const settingsRes = await api("GET", "/salary/settings?fields=*");
  console.log("Salary settings:", JSON.stringify(settingsRes.data?.value, null, 2).slice(0, 500));

  // Check what a "payroll run" looks like - is there a salary/payroll-run endpoint?
  const prRes = await api("GET", "/salary/payrollRun?count=10&fields=*");
  console.log("Payroll runs:", JSON.stringify(prRes.data, null, 2).slice(0, 500));

  // Check employee employment details
  const empDetailRes = await api("GET", `/employee/employment?employeeId=${empId}&count=10&fields=*`);
  console.log("\nEmployee employment:", JSON.stringify(empDetailRes.data?.values, null, 2).slice(0, 500));

  // Check employment details (sub-resource)
  const emplId = emplRes.data?.value?.id;
  const empDetailsRes = await api("GET", `/employee/employment/details?employmentId=${emplId}&fields=*`);
  console.log("Employment details:", JSON.stringify(empDetailsRes.data, null, 2).slice(0, 500));

  // Check salary/payment type
  const sptRes = await api("GET", "/salary/type?count=10&fields=*&sorting=number&order=asc");
  console.log("\nFirst 10 salary types:");
  for (const st of (sptRes.data?.values || []).slice(0, 10)) {
    console.log(`  id=${st.id} number=${st.number} name="${st.name}" description="${st.description}"`);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
