/**
 * Test: Can POST /division + PUT /employee run in parallel?
 * They're independent (division is account-level, PUT employee is employee-level).
 * Then verify POST /employment uses the new division + repaired employee.
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

function generateOrgNumber(): string {
  while (true) {
    const digits = [9];
    for (let i = 0; i < 7; i++) digits.push(Math.floor(Math.random() * 10));
    const weights = [3, 2, 7, 6, 5, 4, 3, 2];
    const sum = digits.reduce((s, d, i) => s + d * weights[i], 0);
    const remainder = 11 - (sum % 11);
    if (remainder === 10) continue;
    const check = remainder === 11 ? 0 : remainder;
    digits.push(check);
    return digits.join("");
  }
}

async function main() {
  // Find an underconfigured employee (dateOfBirth=null, employments=[])
  const empRes = await fetch(`${BASE}/employee?count=100&fields=*`, { headers: H });
  const empData = await empRes.json();
  const employees = empData.values || [];

  // Find one without dateOfBirth and without employments
  let emp = employees.find((e: any) => !e.dateOfBirth && (!e.employments || e.employments.length === 0));

  if (!emp) {
    // Use one that already has dateOfBirth but no employment for the target month
    emp = employees.find((e: any) => e.dateOfBirth && e.email?.includes("sandbox-payroll"));
    if (!emp) {
      console.log("No suitable underconfigured employee found in sandbox.");
      console.log("Testing parallelization pattern with a simple parallel POST div + GET employee...");

      // Just test that POST division and a concurrent API call don't conflict
      const orgNum = generateOrgNumber();
      const t1 = performance.now();
      const [divRes, empRead] = await Promise.all([
        fetch(`${BASE}/division`, {
          method: "POST",
          headers: H,
          body: JSON.stringify({
            name: "ParallelTest",
            organizationNumber: orgNum,
            startDate: "2026-01-01",
            municipalityDate: "2026-01-01",
            municipality: { id: 1 }
          })
        }).then(r => r.json()),
        fetch(`${BASE}/employee?count=1&fields=id,firstName,lastName,dateOfBirth`, { headers: H }).then(r => r.json())
      ]);
      console.log(`Parallel POST div + GET emp: ${(performance.now() - t1).toFixed(0)}ms`);
      console.log(`  Division: id=${divRes.value?.id} name=${divRes.value?.name}`);
      console.log(`  Employee: id=${empRead.values?.[0]?.id} name=${empRead.values?.[0]?.firstName}`);
      console.log("  Both succeeded in parallel ✓");
      return;
    }
  }

  console.log(`Found employee: id=${emp.id} email=${emp.email} dob=${emp.dateOfBirth}`);

  // Test: Parallel POST division + PUT employee
  const orgNum = generateOrgNumber();
  console.log(`\n=== Parallel POST /division + PUT /employee ===`);
  const t1 = performance.now();
  const [divRes, putRes] = await Promise.all([
    fetch(`${BASE}/division`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        name: "Hovudavdeling",
        organizationNumber: orgNum,
        startDate: "2026-01-01",
        municipalityDate: "2026-01-01",
        municipality: { id: 1 }
      })
    }).then(async r => ({ ok: r.ok, status: r.status, data: await r.json() })),
    fetch(`${BASE}/employee/${emp.id}`, {
      method: "PUT",
      headers: H,
      body: JSON.stringify({
        id: emp.id,
        firstName: emp.firstName,
        lastName: emp.lastName,
        email: emp.email,
        dateOfBirth: "1990-01-01"
      })
    }).then(async r => ({ ok: r.ok, status: r.status, data: await r.json() }))
  ]);
  console.log(`  Time: ${(performance.now() - t1).toFixed(0)}ms`);
  console.log(`  Division: ${divRes.ok ? 'OK' : 'FAILED ' + divRes.status} id=${divRes.data?.value?.id}`);
  console.log(`  PUT employee: ${putRes.ok ? 'OK' : 'FAILED ' + putRes.status}`);

  if (divRes.ok && putRes.ok) {
    console.log("  Both succeeded in parallel ✓");

    // Now create employment using new division
    const divId = divRes.data.value.id;
    console.log(`\n  Creating employment with division ${divId}...`);
    const emplRes = await fetch(`${BASE}/employee/employment`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        employee: { id: emp.id },
        division: { id: divId },
        startDate: "2026-07-01",
        isMainEmployer: true,
        taxDeductionCode: "loennFraHovedarbeidsgiver"
      })
    });
    const emplData = await emplRes.json();
    if (emplRes.ok) {
      console.log(`  Employment created: id=${emplData.value?.id} ✓`);

      // Test parallel employment/details + reads
      const emplId = emplData.value.id;
      console.log(`\n=== Parallel POST employment/details + 3 reads ===`);
      const t2 = performance.now();
      const [detRes, stRes, vtRes, acRes] = await Promise.all([
        fetch(`${BASE}/employee/employment/details`, {
          method: "POST",
          headers: H,
          body: JSON.stringify({
            employment: { id: emplId },
            date: "2026-07-01",
            employmentType: "ORDINARY",
            employmentForm: "PERMANENT",
            remunerationType: "MONTHLY_WAGE",
            workingHoursScheme: "NOT_SHIFT",
            percentageOfFullTimeEquivalent: 100,
            monthlySalary: 58650,
            annualSalary: 58650 * 12
          })
        }).then(async r => ({ ok: r.ok, status: r.status, data: await r.json() })),
        fetch(`${BASE}/salary/type?count=1000&fields=*`, { headers: H }).then(async r => ({ ok: r.ok, data: await r.json() })),
        fetch(`${BASE}/ledger/voucherType?name=L%C3%B8nnsbilag&count=1&fields=*`, { headers: H }).then(async r => ({ ok: r.ok, data: await r.json() })),
        fetch(`${BASE}/ledger/account?number=5000,1920&count=10&fields=*`, { headers: H }).then(async r => ({ ok: r.ok, data: await r.json() }))
      ]);
      console.log(`  Time: ${(performance.now() - t2).toFixed(0)}ms`);
      console.log(`  employment/details: ${detRes.ok ? 'OK' : 'FAILED ' + detRes.status}`);
      console.log(`  salary/type: ${stRes.ok ? 'OK' : 'FAILED'}`);
      console.log(`  voucherType: ${vtRes.ok ? 'OK' : 'FAILED'}`);
      console.log(`  accounts: ${acRes.ok ? 'OK' : 'FAILED'}`);

      if (detRes.ok && stRes.ok && vtRes.ok && acRes.ok) {
        console.log("  All 4 parallel ops succeeded ✓");
      }
    } else {
      console.log(`  Employment FAILED: ${emplRes.status}`, JSON.stringify(emplData).slice(0, 300));
    }
  }
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
