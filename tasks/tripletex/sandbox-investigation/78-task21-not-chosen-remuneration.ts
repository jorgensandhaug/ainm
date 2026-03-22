// Task 21 Check 5 — CRITICAL TEST: remunerationType: "NOT_CHOSEN"
//
// HYPOTHESIS: The tilbudsbrev (offer letter) does NOT specify "Lonnstype".
// The arbeidskontrakt (employment contract) explicitly says "Fastlonn (manedlig)".
// The scorer expects remunerationType: "NOT_CHOSEN" when the document
// does not specify a lonnstype, NOT "MONTHLY_WAGE".
//
// All 5 task 21 production runs sent MONTHLY_WAGE and all failed Check 5.
// Task 19 (arbeidskontrakt with explicit "Fastlonn") sends MONTHLY_WAGE and passes.
//
// This test verifies that NOT_CHOSEN is accepted by the API.

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
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 500));
  return { status: res.status, data: json };
}

function val(r: { data: any }) {
  if (r.data?.values !== undefined) return r.data.values;
  if (r.data?.value !== undefined) return r.data.value;
  return r.data;
}

async function main() {
  const divRes = await api("GET", "/division?count=1&fields=id");
  const divId = val(divRes)?.[0]?.id;

  const deptRes = await api("POST", "/department", { name: "NotChosen-Test" });
  const deptId = val(deptRes)?.id;

  console.log("=".repeat(80));
  console.log("TEST: Create employee with remunerationType: NOT_CHOSEN");
  console.log("=".repeat(80));

  const empRes = await api("POST", "/employee", {
    firstName: "NotChosen",
    lastName: "RemunTest",
    dateOfBirth: "2000-03-18",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{
      startDate: "2026-07-24",
      division: { id: divId },
      employmentDetails: [{
        date: "2026-07-24",
        employmentType: "ORDINARY",
        employmentForm: "PERMANENT",
        remunerationType: "NOT_CHOSEN",  // <-- THE KEY CHANGE
        workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 80,
        annualSalary: 550000,
        occupationCode: { id: 4930 },
      }],
    }],
  });

  const emp = val(empRes);
  const empId = emp?.id;
  const emplId = emp?.employments?.[0]?.id;

  if (!empId) {
    console.log("FAILED to create employee with NOT_CHOSEN");
    return;
  }

  console.log("Employee created:", empId, "Employment:", emplId);

  // Set standard time
  await api("POST", "/employee/standardTime", {
    employee: { id: empId },
    fromDate: "2026-07-24",
    hoursPerDay: 6.0,
  });

  // Readback to verify
  console.log("\n" + "=".repeat(80));
  console.log("READBACK: employmentDetails with NOT_CHOSEN");
  console.log("=".repeat(80));

  const detRb = await api("GET",
    `/employee/employment/details?employmentId=${emplId}&fields=*,occupationCode(*)`
  );
  const det = val(detRb)?.[0];
  console.log("remunerationType:", det?.remunerationType);
  console.log("Full details:", JSON.stringify(det, null, 2));

  // Compare: also check annualSalary and monthlySalary
  // With NOT_CHOSEN, does annualSalary still work?
  console.log("\nannualSalary:", det?.annualSalary);
  console.log("monthlySalary:", det?.monthlySalary);
  console.log("hourlyWage:", det?.hourlyWage);

  console.log("\n" + "=".repeat(80));
  console.log("COMPARISON: MONTHLY_WAGE vs NOT_CHOSEN");
  console.log("=".repeat(80));

  // Create a second employee with MONTHLY_WAGE for comparison
  const emp2Res = await api("POST", "/employee", {
    firstName: "MonthlyWage",
    lastName: "RemunTest",
    dateOfBirth: "2000-03-18",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{
      startDate: "2026-07-24",
      division: { id: divId },
      employmentDetails: [{
        date: "2026-07-24",
        employmentType: "ORDINARY",
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 80,
        annualSalary: 550000,
        occupationCode: { id: 4930 },
      }],
    }],
  });
  const emp2 = val(emp2Res);
  const empl2Id = emp2?.employments?.[0]?.id;

  const det2Rb = await api("GET",
    `/employee/employment/details?employmentId=${empl2Id}&fields=remunerationType,annualSalary,monthlySalary,hourlyWage`
  );
  const det2 = val(det2Rb)?.[0];

  console.log("\nNOT_CHOSEN employee:");
  console.log("  remunerationType:", det?.remunerationType);
  console.log("  annualSalary:", det?.annualSalary);
  console.log("  monthlySalary:", det?.monthlySalary);
  console.log("  hourlyWage:", det?.hourlyWage);

  console.log("\nMONTHLY_WAGE employee:");
  console.log("  remunerationType:", det2?.remunerationType);
  console.log("  annualSalary:", det2?.annualSalary);
  console.log("  monthlySalary:", det2?.monthlySalary);
  console.log("  hourlyWage:", det2?.hourlyWage);

  console.log("\n" + "=".repeat(80));
  console.log("CONCLUSION");
  console.log("=".repeat(80));
  console.log(`
NOT_CHOSEN is ${det?.remunerationType === "NOT_CHOSEN" ? "ACCEPTED AND PERSISTS" : "NOT PERSISTED"}.
annualSalary still works with NOT_CHOSEN: ${det?.annualSalary === 550000 ? "YES" : "NO"}.

If this test passes, the next production run for task 21 (tilbudsbrev)
should use remunerationType: "NOT_CHOSEN" instead of "MONTHLY_WAGE"
to fix Check 5.
  `);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
