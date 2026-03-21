const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  console.log(`${method} /${path} → ${r.status}`);
  if (!r.ok) console.log("ERROR:", JSON.stringify(json, null, 2));
  return json;
}

async function main() {
  const ts = Date.now();

  // Get division
  const divRes = await api("GET", "division?count=1&fields=id");
  const divisionId = divRes.values?.[0]?.id;

  // Create department
  const deptRes = await api("POST", "department", { name: `TestDept_${ts}` });
  const departmentId = deptRes.value.id;

  // Create employee
  const empRes = await api("POST", "employee", {
    firstName: "TestStdTime",
    lastName: `Employee_${ts}`,
    dateOfBirth: "1981-11-06",
    nationalIdentityNumber: "06118185755",
    email: "test@example.org",
    bankAccountNumber: "63096583860",
    userType: "NO_ACCESS",
    department: { id: departmentId },
    employments: [{
      startDate: "2026-11-24",
      ...(divisionId ? { division: { id: divisionId } } : {}),
      employmentDetails: [{
        date: "2026-11-24",
        employmentType: "ORDINARY",
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 100,
        annualSalary: 790000,
        occupationCode: { id: 4672 },
      }],
    }],
  });
  const employeeId = empRes.value.id;
  console.log("Employee ID:", employeeId);

  // Set standard worktime 7.5h
  const stdTimeRes = await api("POST", "employee/standardTime", {
    employee: { id: employeeId },
    fromDate: "2026-11-24",
    hoursPerDay: 7.5,
  });
  console.log("\n=== STANDARD TIME RESPONSE ===");
  console.log(JSON.stringify(stdTimeRes.value, null, 2));

  // Read back employee standard time to verify
  const stdTimeRead = await api("GET", `employee/standardTime?employeeId=${employeeId}&fields=*`);
  console.log("\n=== STANDARD TIME READBACK ===");
  console.log(JSON.stringify(stdTimeRead.values, null, 2));

  // Also check what company-level standard time exists (for comparison)
  const companyStdTime = await api("GET", "salary/settings/standardTime?count=5&fields=*");
  console.log("\n=== COMPANY STANDARD TIME ===");
  console.log(JSON.stringify(companyStdTime.values, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
