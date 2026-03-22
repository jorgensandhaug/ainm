// Task 21 Check 5 Deep Investigation
// Test ALL NOT_CHOSEN variations to understand which enum field might be the issue.
//
// Hypothesis: Check 5 = remunerationType should be NOT_CHOSEN for tilbudsbrev
// Alternative: Check 5 could be employmentType or workingHoursScheme
//
// The tilbudsbrev PDF explicitly states:
//   - Ansettelsesform: Fast stilling => employmentForm: PERMANENT (explicit)
//   - NO "Lonnstype" field => remunerationType: ??? (NOT_CHOSEN vs MONTHLY_WAGE)
//   - NO explicit shift/work scheme mention => workingHoursScheme: ??? (NOT_SHIFT vs NOT_CHOSEN)
//   - NO explicit employment type mention => employmentType: ??? (ORDINARY vs NOT_CHOSEN)
//
// We test 4 employees:
//   A: MONTHLY_WAGE + ORDINARY + NOT_SHIFT (current production = what fails)
//   B: NOT_CHOSEN remuneration only
//   C: NOT_CHOSEN remuneration + NOT_CHOSEN workingHoursScheme
//   D: NOT_CHOSEN remuneration + NOT_CHOSEN workingHoursScheme + NOT_CHOSEN employmentType
//   E: Minimal - no enum fields sent at all (check defaults)

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json).slice(0, 800));
  return { status: res.status, data: json };
}

function val(r: { data: any }) {
  if (r.data?.values !== undefined) return r.data.values;
  if (r.data?.value !== undefined) return r.data.value;
  return r.data;
}

async function main() {
  // Setup
  const divRes = await api("GET", "/division?count=1&fields=id");
  const divId = val(divRes)?.[0]?.id;
  const deptRes = await api("POST", "/department", { name: "Check5-Enum-Test" });
  const deptId = val(deptRes)?.id;

  console.log("divId:", divId, "deptId:", deptId);

  // ====================================================================
  // Test A: Current production pattern (MONTHLY_WAGE + ORDINARY + NOT_SHIFT)
  // ====================================================================
  console.log("\n" + "=".repeat(80));
  console.log("TEST A: Current production (MONTHLY_WAGE + ORDINARY + NOT_SHIFT)");
  console.log("=".repeat(80));

  const empA = await api("POST", "/employee", {
    firstName: "TestA", lastName: "Current", dateOfBirth: "2000-03-18",
    userType: "NO_ACCESS", department: { id: deptId },
    employments: [{ startDate: "2026-07-24", division: { id: divId },
      employmentDetails: [{ date: "2026-07-24",
        employmentType: "ORDINARY", employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE", workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 80, annualSalary: 550000,
        occupationCode: { id: 4930 } }] }],
  });

  // ====================================================================
  // Test B: NOT_CHOSEN remuneration only
  // ====================================================================
  console.log("\n" + "=".repeat(80));
  console.log("TEST B: NOT_CHOSEN remunerationType only");
  console.log("=".repeat(80));

  const empB = await api("POST", "/employee", {
    firstName: "TestB", lastName: "RemunNC", dateOfBirth: "2000-03-18",
    userType: "NO_ACCESS", department: { id: deptId },
    employments: [{ startDate: "2026-07-24", division: { id: divId },
      employmentDetails: [{ date: "2026-07-24",
        employmentType: "ORDINARY", employmentForm: "PERMANENT",
        remunerationType: "NOT_CHOSEN", workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 80, annualSalary: 550000,
        occupationCode: { id: 4930 } }] }],
  });

  // ====================================================================
  // Test C: NOT_CHOSEN remuneration + workingHoursScheme
  // ====================================================================
  console.log("\n" + "=".repeat(80));
  console.log("TEST C: NOT_CHOSEN remunerationType + workingHoursScheme");
  console.log("=".repeat(80));

  const empC = await api("POST", "/employee", {
    firstName: "TestC", lastName: "NCNC", dateOfBirth: "2000-03-18",
    userType: "NO_ACCESS", department: { id: deptId },
    employments: [{ startDate: "2026-07-24", division: { id: divId },
      employmentDetails: [{ date: "2026-07-24",
        employmentType: "ORDINARY", employmentForm: "PERMANENT",
        remunerationType: "NOT_CHOSEN", workingHoursScheme: "NOT_CHOSEN",
        percentageOfFullTimeEquivalent: 80, annualSalary: 550000,
        occupationCode: { id: 4930 } }] }],
  });

  // ====================================================================
  // Test D: ALL NOT_CHOSEN except employmentForm (which PDF explicitly states)
  // ====================================================================
  console.log("\n" + "=".repeat(80));
  console.log("TEST D: All NOT_CHOSEN except employmentForm");
  console.log("=".repeat(80));

  const empD = await api("POST", "/employee", {
    firstName: "TestD", lastName: "AllNC", dateOfBirth: "2000-03-18",
    userType: "NO_ACCESS", department: { id: deptId },
    employments: [{ startDate: "2026-07-24", division: { id: divId },
      employmentDetails: [{ date: "2026-07-24",
        employmentType: "NOT_CHOSEN", employmentForm: "PERMANENT",
        remunerationType: "NOT_CHOSEN", workingHoursScheme: "NOT_CHOSEN",
        percentageOfFullTimeEquivalent: 80, annualSalary: 550000,
        occupationCode: { id: 4930 } }] }],
  });

  // ====================================================================
  // Test E: Minimal - no enum fields at all (check API defaults)
  // ====================================================================
  console.log("\n" + "=".repeat(80));
  console.log("TEST E: No enum fields sent at all");
  console.log("=".repeat(80));

  const empE = await api("POST", "/employee", {
    firstName: "TestE", lastName: "Minimal", dateOfBirth: "2000-03-18",
    userType: "NO_ACCESS", department: { id: deptId },
    employments: [{ startDate: "2026-07-24", division: { id: divId },
      employmentDetails: [{ date: "2026-07-24",
        percentageOfFullTimeEquivalent: 80, annualSalary: 550000,
        occupationCode: { id: 4930 } }] }],
  });

  // ====================================================================
  // READBACK ALL
  // ====================================================================
  console.log("\n" + "=".repeat(80));
  console.log("READBACK ALL EMPLOYMENT DETAILS");
  console.log("=".repeat(80));

  const tests = [
    { label: "A-Current", emp: val(empA) },
    { label: "B-RemunNC", emp: val(empB) },
    { label: "C-RemunWHSNC", emp: val(empC) },
    { label: "D-AllNC", emp: val(empD) },
    { label: "E-Minimal", emp: val(empE) },
  ];

  for (const t of tests) {
    if (!t.emp?.id) {
      console.log(`\n${t.label}: FAILED TO CREATE`);
      continue;
    }
    const emplId = t.emp.employments?.[0]?.id;
    const detRb = await api("GET",
      `/employee/employment/details?employmentId=${emplId}&fields=*`
    );
    const det = val(detRb)?.[0];
    console.log(`\n${t.label}:`);
    console.log(`  employmentType:     ${det?.employmentType}`);
    console.log(`  employmentForm:     ${det?.employmentForm}`);
    console.log(`  remunerationType:   ${det?.remunerationType}`);
    console.log(`  workingHoursScheme: ${det?.workingHoursScheme}`);
    console.log(`  annualSalary:       ${det?.annualSalary}`);
    console.log(`  monthlySalary:      ${det?.monthlySalary}`);
    console.log(`  hourlyWage:         ${det?.hourlyWage}`);
  }

  console.log("\n" + "=".repeat(80));
  console.log("ANALYSIS");
  console.log("=".repeat(80));
  console.log(`
Key question: What are the API DEFAULTS when enum fields are omitted?
If defaults are NOT_CHOSEN, that tells us the scorer might check defaults.
If defaults are ORDINARY/NOT_SHIFT/MONTHLY_WAGE, that means omitting is equivalent to sending them.

The production runs always send:
  employmentType: ORDINARY
  employmentForm: PERMANENT
  remunerationType: MONTHLY_WAGE
  workingHoursScheme: NOT_SHIFT

The tilbudsbrev PDF only explicitly states:
  Ansettelsesform: Fast stilling => employmentForm: PERMANENT
  (everything else is implied/defaulted)

CRITICAL: If the API defaults for omitted fields are NOT_CHOSEN,
then the scorer likely expects NOT_CHOSEN for fields not explicitly
stated in the document. This would mean remunerationType: NOT_CHOSEN
is the correct fix for Check 5.
`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
