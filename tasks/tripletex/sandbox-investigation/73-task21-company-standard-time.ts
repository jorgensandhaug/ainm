// Task 21 Check 5 - Test company-level standard time
//
// HYPOTHESIS: The scorer might check the company-level standard time
// at /salary/settings/standardTime. If this doesn't exist on fresh
// production accounts, and the scorer reads it, the check would fail.
//
// Also testing: what does GET /employee/standardTime return for
// employees when we DON'T set it? And what about the relationship
// between standardTime and percentage?

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
  console.log("=" .repeat(80));
  console.log("TEST 1: Company-level standard time");
  console.log("=".repeat(80));

  // Check company standard time (this is the endpoint our early runs mistakenly used)
  const compStdTime = await api("GET", "/salary/settings/standardTime?fields=*");
  console.log("Company standard time:", JSON.stringify(val(compStdTime), null, 2));

  // Check what other salary settings exist
  const salarySettings = await api("GET", "/salary/settings?fields=*");
  console.log("Salary settings:", JSON.stringify(val(salarySettings), null, 2)?.slice(0, 2000));

  console.log("\n" + "=".repeat(80));
  console.log("TEST 2: Employee WITHOUT standardTime set");
  console.log("=".repeat(80));

  const divRes = await api("GET", "/division?count=1&fields=id");
  const divId = val(divRes)?.[0]?.id;
  const deptRes = await api("POST", "/department", { name: "NoStdTime-Test" });
  const deptId = val(deptRes)?.id;

  // Create employee WITHOUT setting standard time
  const emp1Res = await api("POST", "/employee", {
    firstName: "NoStdTime",
    lastName: "Employee",
    dateOfBirth: "1990-05-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{
      startDate: "2026-08-01",
      division: { id: divId },
      employmentDetails: [{
        date: "2026-08-01",
        employmentType: "ORDINARY",
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 100,
        annualSalary: 600000,
        occupationCode: { id: 4930 },
      }],
    }],
  });
  const emp1Id = val(emp1Res)?.id;

  // Check what standardTime returns for this employee (no POST was done)
  const st1 = await api("GET", `/employee/standardTime?employeeId=${emp1Id}&fields=*`);
  console.log("StandardTime for employee WITHOUT POST:", JSON.stringify(val(st1), null, 2));

  console.log("\n" + "=".repeat(80));
  console.log("TEST 3: Check /employee/employment/leaveOfAbsence endpoint");
  console.log("=".repeat(80));

  // Maybe there's a leave-of-absence or similar endpoint we need to check
  const emplId = val(emp1Res)?.employments?.[0]?.id;
  const loa = await api("GET", `/employee/employment/leaveOfAbsence?employmentId=${emplId}&fields=*`);
  console.log("Leave of absence:", JSON.stringify(val(loa), null, 2));

  console.log("\n" + "=".repeat(80));
  console.log("TEST 4: Check /employee/employment endpoint for employment search");
  console.log("=".repeat(80));

  // Check what other employment-related endpoints exist
  const empSearch = await api("GET", `/employee?firstName=NoStdTime&fields=*,employments(*)`);
  console.log("Employee search:", JSON.stringify(val(empSearch)?.[0]?.employments?.[0], null, 2));

  console.log("\n" + "=".repeat(80));
  console.log("TEST 5: Employee category endpoint");
  console.log("=".repeat(80));

  // Check if employee categories exist
  const categories = await api("GET", "/employee/category?fields=*");
  console.log("Categories:", JSON.stringify(val(categories), null, 2));

  console.log("\n" + "=".repeat(80));
  console.log("TEST 6: Try POST /employee/employment/details separately");
  console.log("=".repeat(80));

  // What if we need to POST employment details SEPARATELY after the employee?
  // Maybe the nested creation doesn't fully link them on production?
  // Let's check if there's a difference between nested vs separate creation
  const detRb = await api("GET", `/employee/employment/details?employmentId=${emplId}&fields=*,occupationCode(*)`);
  console.log("Nested employment details readback:", JSON.stringify(val(detRb)?.[0], null, 2));
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
