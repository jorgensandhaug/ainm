// Verify the existing-division underconfigured-employee path works in sandbox
// This is the 6-call branch:
// 1. GET /employee → underconfigured
// 2. GET /division → exists
// 3. PUT /employee (repair dateOfBirth)
// 4. POST /employee/employment
// 5. GET /salary/type
// 6. POST /salary/transaction

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const YEAR = 2026;
const MONTH = 4; // Use a different month to avoid conflicts
const DATE = "2026-04-01";

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
  console.log(`[call ${callCount}] ${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("ERROR:", JSON.stringify(json, null, 2));
  return { status: res.status, data: json };
}

async function main() {
  // SETUP: Create a disposable underconfigured employee
  // Employee creation in sandbox requires more fields; check what's needed
  console.log("=== SETUP: Checking existing employees for test ===");
  callCount = 0;

  // Find an existing underconfigured employee or create one
  // First, let's just find any employee with a known email pattern
  const setupRes = await api("GET", "/employee?count=50&fields=*", undefined, "SETUP");
  callCount = 0;

  const allEmps = setupRes.data?.values || [];
  console.log(`Found ${allEmps.length} employees total`);

  // Look for underconfigured employees
  const underconfigured = allEmps.filter((e: any) => e.dateOfBirth === null && (!e.employments || e.employments.length === 0));
  console.log(`Underconfigured employees: ${underconfigured.length}`);

  if (underconfigured.length > 0) {
    const emp = underconfigured[0];
    console.log(`Using existing underconfigured employee: id=${emp.id}, email=${emp.email}, name=${emp.firstName} ${emp.lastName}`);
    console.log(`\n=== RUNNING 6-CALL PATH ===\n`);

    // Simulate calling GET employee (already have data, but counting for accuracy)
    console.log(`[call 1] GET /employee (already have data — id=${emp.id}, underconfigured)`);
    callCount = 1;

    // Call 2: GET /division
    const divRes = await api("GET", "/division?count=1&fields=*");
    const divisions = divRes.data?.values || [];
    if (divisions.length === 0) {
      console.log("No divisions — would need to create. Skipping for this test.");
      return;
    }
    const divisionId = divisions[0].id;
    console.log(`  Division found: id=${divisionId}`);

    // Call 3: PUT /employee (repair)
    const putRes = await api("PUT", `/employee/${emp.id}`, {
      id: emp.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      dateOfBirth: "1990-01-01",
    });
    console.log(`  Employee dateOfBirth repaired`);

    // Call 4: POST /employee/employment
    const emplRes = await api("POST", "/employee/employment", {
      employee: { id: emp.id },
      division: { id: divisionId },
      startDate: `${YEAR}-${String(MONTH).padStart(2, "0")}-01`,
      isMainEmployer: true,
      taxDeductionCode: "loennFraHovedarbeidsgiver",
    });
    console.log(`  Employment created`);

    // Call 5: GET /salary/type
    const stRes = await api("GET", "/salary/type?count=1000&fields=*");
    const salaryTypes = stRes.data?.values || [];
    const fastlonn = salaryTypes.find((st: any) => st.name === "Fastlønn");
    const bonus = salaryTypes.find((st: any) => st.name === "Bonus");
    console.log(`  Fastlønn id=${fastlonn?.id}, Bonus id=${bonus?.id}`);

    // Call 6: POST /salary/transaction
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
            salaryType: { id: fastlonn!.id },
            description: `Fastlønn april ${YEAR}`,
            year: YEAR,
            month: MONTH,
            count: 1,
            rate: 41750,
            amount: 41750,
          },
          {
            employee: { id: emp.id },
            salaryType: { id: bonus!.id },
            description: `Bonus april ${YEAR}`,
            year: YEAR,
            month: MONTH,
            count: 1,
            rate: 6750,
            amount: 6750,
          },
        ],
      }],
    };

    const txRes = await api("POST", "/salary/transaction", payload);
    console.log(`\n=== RESULT ===`);
    console.log(`Total API calls: ${callCount}`);
    console.log(`Success: ${txRes.status === 201 ? "YES" : "NO"}`);

    if (txRes.status === 201) {
      const payslipId = txRes.data?.value?.payslips?.[0]?.id;
      if (payslipId) {
        console.log(`\n=== VERIFICATION (uncounted) ===`);
        const verifyCallCount = callCount;
        const psRes = await api("GET", `/salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`, undefined);
        callCount = verifyCallCount;
        const ps = psRes.data?.value;
        console.log(`grossAmount=${ps?.grossAmount}, amount=${ps?.amount}`);
        const specs = ps?.specifications || [];
        for (const s of specs) {
          console.log(`  ${s.salaryType?.name}: amount=${s.amount}`);
        }
      }
    }
  } else {
    console.log("No underconfigured employees found in sandbox");
    // Show what employees exist
    for (const e of allEmps.slice(0, 5)) {
      console.log(`  id=${e.id}, email=${e.email}, dateOfBirth=${e.dateOfBirth}, employments=${e.employments?.length || 0}`);
    }
  }
}

main().catch(console.error);
