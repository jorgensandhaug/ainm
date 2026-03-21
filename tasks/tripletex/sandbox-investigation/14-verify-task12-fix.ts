// VERIFY: Task 12 fix — employment details matter for payroll
// Compare WITH vs WITHOUT employment details
// Since sandbox can't create employees (needs userType), use existing repaired ones
// and test POST /employee/employment/details
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
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 600));
  return { status: res.status, data: json };
}

async function main() {
  const SALARY = 41750;
  const BONUS = 6750;

  // ====================================================
  // PART 1: Check existing sandbox employee without details
  // ====================================================
  console.log("=== PART 1: Employee WITHOUT employment details ===\n");

  // Employee 18592549 already has employment 2806874 from earlier tests
  // But we added details in script 12. Let's check a different employee.
  // Employee 18591984 was also used in sandbox proofs
  const emp1Res = await api("GET", "/employee/18591984?fields=*");
  const emp1 = emp1Res.data?.value;
  console.log(`Employee 18591984: dateOfBirth=${emp1?.dateOfBirth}`);

  const empl1Res = await api("GET", "/employee/employment?employeeId=18591984&count=10&fields=*");
  for (const empl of (empl1Res.data?.values || [])) {
    console.log(`  Employment ${empl.id}: startDate=${empl.startDate} division=${empl.division?.id}`);
    console.log(`    employmentDetails count: ${empl.employmentDetails?.length}`);
    console.log(`    latestSalary: ${empl.latestSalary?.id || 'null'}`);

    const detRes = await api("GET", `/employee/employment/details?employmentId=${empl.id}&fields=*`);
    console.log(`    details: ${JSON.stringify(detRes.data?.values, null, 2)}`);
  }

  // ====================================================
  // PART 2: Create employment details for employee WITHOUT them
  // ====================================================
  console.log("\n=== PART 2: Adding employment details ===\n");

  const employments1 = empl1Res.data?.values || [];
  if (employments1.length > 0) {
    const emplId = employments1[0].id;

    // Check if details already exist
    const existingDet = await api("GET", `/employee/employment/details?employmentId=${emplId}&fields=*`);
    if ((existingDet.data?.values || []).length === 0) {
      console.log("No existing details — creating...");

      const detRes = await api("POST", "/employee/employment/details", {
        employment: { id: emplId },
        date: "2026-03-01",
        employmentType: "ORDINARY",
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 100,
        monthlySalary: SALARY,
        annualSalary: SALARY * 12,
      });
      console.log("Created:", JSON.stringify(detRes.data?.value, null, 2));
    } else {
      console.log("Details already exist:", JSON.stringify(existingDet.data?.values, null, 2).slice(0, 500));
    }

    // Verify after
    const afterRes = await api("GET", `/employee/employment/${emplId}?fields=*`);
    console.log("\nEmployment after details:");
    console.log(`  employmentDetails count: ${afterRes.data?.value?.employmentDetails?.length}`);
    console.log(`  latestSalary: ${afterRes.data?.value?.latestSalary?.id || 'null'}`);
  }

  // ====================================================
  // PART 3: Test minimal required fields for employment details
  // ====================================================
  console.log("\n=== PART 3: Minimal fields test ===\n");

  // What's the absolute minimum for POST /employee/employment/details?
  if (employments1.length > 0) {
    const emplId = employments1[0].id;

    // Test: just employment + date + monthlySalary
    const minRes = await api("POST", "/employee/employment/details", {
      employment: { id: emplId },
      date: "2026-05-01",
      monthlySalary: SALARY,
    });
    console.log("Minimal (date+salary only):", minRes.status);
    if (minRes.status < 400) {
      console.log("  Result:", JSON.stringify(minRes.data?.value, null, 2));
    }

    // Test: employment + date only (no salary)
    const min2Res = await api("POST", "/employee/employment/details", {
      employment: { id: emplId },
      date: "2026-06-01",
    });
    console.log("\nMinimal (date only):", min2Res.status);
    if (min2Res.status < 400) {
      console.log("  Result:", JSON.stringify(min2Res.data?.value, null, 2));
    }
  }

  // ====================================================
  // PART 4: Check what payslip looks like WITH employment details
  // ====================================================
  console.log("\n=== PART 4: Check payslips with employment details ===\n");

  // Employee 18592549 has employment details now (from script 12)
  // Check if there are payslips
  const ps1Res = await api("GET", "/salary/payslip?employeeId=18592549&count=10&fields=*,specifications(*,salaryType(*))");
  console.log("Payslips for 18592549:", ps1Res.data?.fullResultSize);
  for (const ps of (ps1Res.data?.values || [])) {
    console.log(`  PS ${ps.id}: year=${ps.year} month=${ps.month} gross=${ps.grossAmount} net=${ps.netAmount}`);
    for (const s of (ps.specifications || [])) {
      console.log(`    ${s.salaryType?.name}: amount=${s.amount} count=${s.count} rate=${s.rate}`);
    }
  }

  const ps2Res = await api("GET", "/salary/payslip?employeeId=18591984&count=10&fields=*,specifications(*,salaryType(*))");
  console.log("Payslips for 18591984:", ps2Res.data?.fullResultSize);
  for (const ps of (ps2Res.data?.values || [])) {
    console.log(`  PS ${ps.id}: year=${ps.year} month=${ps.month} gross=${ps.grossAmount} net=${ps.netAmount}`);
  }

  // ====================================================
  // PART 5: Full payroll flow simulation with employee that has details
  // ====================================================
  console.log("\n=== PART 5: Full salary transaction check ===\n");

  // Check salary types
  const stRes = await api("GET", "/salary/type?count=1000&fields=*");
  const fastlonn = stRes.data?.values?.find((t: any) => t.name === "Fastlønn");
  const bonus = stRes.data?.values?.find((t: any) => t.name === "Bonus");
  console.log(`Fastlønn: id=${fastlonn?.id} number=${fastlonn?.number}`);
  console.log(`Bonus: id=${bonus?.id} number=${bonus?.number}`);

  // Try creating a salary transaction for emp 18592549 (has details)
  console.log("\nCreating salary transaction for employee WITH details (18592549)...");
  const txRes = await api("POST", "/salary/transaction", {
    date: "2026-03-21",
    year: 2026,
    month: 4, // Use month 4 to avoid collision with existing
    paySlipsAvailableDate: "2026-03-21",
    payslips: [{
      employee: { id: 18592549 },
      specifications: [
        { employee: { id: 18592549 }, salaryType: { id: fastlonn?.id }, description: "Fastlønn", year: 2026, month: 4, count: 1, rate: SALARY, amount: SALARY },
        { employee: { id: 18592549 }, salaryType: { id: bonus?.id }, description: "Bonus", year: 2026, month: 4, count: 1, rate: BONUS, amount: BONUS },
      ],
    }],
  });

  if (txRes.status < 400) {
    const txId = txRes.data?.value?.id;
    const psId = txRes.data?.value?.payslips?.[0]?.id;
    console.log(`Transaction: ${txId}, Payslip: ${psId}`);

    // Check payslip
    if (psId) {
      const psCheck = await api("GET", `/salary/payslip/${psId}?fields=*,specifications(*,salaryType(*))`);
      const ps = psCheck.data?.value;
      console.log(`\nPayslip details:`);
      console.log(`  grossAmount=${ps?.grossAmount} netAmount=${ps?.netAmount} amount=${ps?.amount}`);
      console.log(`  year=${ps?.year} month=${ps?.month}`);
      console.log(`  specifications: ${ps?.specifications?.length}`);
      for (const s of (ps?.specifications || [])) {
        console.log(`    ${s.salaryType?.name}(${s.salaryType?.number}): amount=${s.amount} count=${s.count} rate=${s.rate}`);
      }

      // Check ALL fields
      const allKeys = Object.keys(ps || {}).filter(k => ps[k] != null);
      console.log(`\n  All non-null fields: ${allKeys.join(", ")}`);
    }
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
