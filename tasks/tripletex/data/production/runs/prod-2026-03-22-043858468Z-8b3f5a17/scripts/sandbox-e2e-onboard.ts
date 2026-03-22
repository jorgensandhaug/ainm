const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) { console.log(text); }
  return { status: res.status, data: res.ok ? JSON.parse(text) : null, raw: text };
}

async function main() {
  // Simulate optimal 4-call path (STYRK 1211 hardcoded as FINANSSJEF id=1577)
  const ts = Date.now();

  // Step 1: parallel - division + department
  const [divRes, deptRes] = await Promise.all([
    api("GET", "/division?count=1&fields=id"),
    api("POST", "/department", { name: `TestDept-${ts}` }),
  ]);

  const divisionId = divRes.data.count > 0 ? divRes.data.values[0].id : null;
  const departmentId = deptRes.data!.value.id;
  console.log(`Division: ${divisionId}, Department: ${departmentId}`);

  // Step 2: POST /employee with hardcoded occ code
  const empPayload: any = {
    firstName: "Test",
    lastName: `Sandbox-${ts}`,
    dateOfBirth: "1987-10-19",
    userType: "NO_ACCESS",
    nationalIdentityNumber: "19108715467",
    bankAccountNumber: "94000111575",
    email: "test@example.org",
    department: { id: departmentId },
    employments: [
      {
        startDate: "2026-08-20",
        ...(divisionId ? { division: { id: divisionId } } : {}),
        employmentDetails: [
          {
            date: "2026-08-20",
            employmentType: "ORDINARY",
            employmentForm: "PERMANENT",
            remunerationType: "MONTHLY_WAGE",
            workingHoursScheme: "NOT_SHIFT",
            percentageOfFullTimeEquivalent: 100,
            annualSalary: 530000,
            occupationCode: { id: 1577 }, // FINANSSJEF, hardcoded
          },
        ],
      },
    ],
  };

  const empRes = await api("POST", "/employee", empPayload);
  if (!empRes.data) { console.log("Employee creation failed!"); return; }
  const empId = empRes.data.value.id;
  console.log(`Employee created: ${empId}`);

  // Step 3: POST /employee/standardTime
  const stRes = await api("POST", "/employee/standardTime", {
    employee: { id: empId },
    fromDate: "2026-08-20",
    hoursPerDay: 7.5,
  });

  // Verify: GET the employee with fields=* to check all fields
  console.log("\n=== VERIFICATION (not counted in optimal path) ===");
  const verifyRes = await api("GET", `/employee/${empId}?fields=*`);
  if (verifyRes.data) {
    const emp = verifyRes.data.value;
    console.log(`Name: ${emp.firstName} ${emp.lastName}`);
    console.log(`DOB: ${emp.dateOfBirth}`);
    console.log(`NIN: ${emp.nationalIdentityNumber}`);
    console.log(`Bank: ${emp.bankAccountNumber}`);
    console.log(`Email: ${emp.email}`);
    console.log(`Department: ${JSON.stringify(emp.department)}`);
    console.log(`Employments: ${JSON.stringify(emp.employments)}`);
  }

  // Also verify employment details
  const empDetailsRes = await api("GET", `/employee/employment?employeeId=${empId}&fields=*`);
  if (empDetailsRes.data) {
    const emps = empDetailsRes.data.values;
    for (const e of emps) {
      console.log(`\nEmployment ${e.id}:`);
      console.log(`  startDate: ${e.startDate}`);
      console.log(`  division: ${JSON.stringify(e.division)}`);
      console.log(`  employmentDetails: ${JSON.stringify(e.employmentDetails)}`);
    }
  }

  // Verify standardTime
  const stVerify = await api("GET", `/employee/standardTime?employeeId=${empId}&fields=*`);
  if (stVerify.data) {
    console.log(`\nStandardTime: ${JSON.stringify(stVerify.data.values)}`);
  }

  console.log("\n=== 4-call optimal path verified ===");
}

main().catch(e => { console.error(e); process.exit(1); });
