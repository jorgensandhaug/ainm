const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} /${path} → ${r.status}`);
  if (!r.ok) console.log("ERROR:", JSON.stringify(json, null, 2));
  return json;
}

async function main() {
  // Get division
  const divRes = await api("GET", "division?count=1&fields=id");
  const divisionId = divRes.values?.length > 0 ? divRes.values[0].id : null;
  console.log("Division ID:", divisionId);

  // Create department
  const ts = Date.now();
  const deptRes = await api("POST", "department", { name: `Innkjøp_test_${ts}` });
  const departmentId = deptRes.value.id;
  console.log("Department ID:", departmentId);

  // Create employee with same payload as production
  const employeePayload: any = {
    firstName: "Miguel",
    lastName: `Costa_test_${ts}`,
    dateOfBirth: "1981-11-06",
    nationalIdentityNumber: "06118185755",
    email: "miguel.costa@example.org",
    bankAccountNumber: "63096583860",
    userType: "NO_ACCESS",
    department: { id: departmentId },
    employments: [
      {
        startDate: "2026-11-24",
        ...(divisionId ? { division: { id: divisionId } } : {}),
        employmentDetails: [
          {
            date: "2026-11-24",
            employmentType: "ORDINARY",
            employmentForm: "PERMANENT",
            remunerationType: "MONTHLY_WAGE",
            workingHoursScheme: "NOT_SHIFT",
            percentageOfFullTimeEquivalent: 100,
            annualSalary: 790000,
            occupationCode: { id: 4672 },
          },
        ],
      },
    ],
  };

  const empRes = await api("POST", "employee", employeePayload);
  const employeeId = empRes.value.id;
  console.log("Employee ID:", employeeId);

  // Read back the full employee with all fields expanded
  const readback = await api("GET", `employee/${employeeId}?fields=*,department(*),employments(*)`);
  console.log("\n=== FULL EMPLOYEE READBACK ===");
  console.log(JSON.stringify(readback.value, null, 2));

  // Read employment details
  const employmentId = empRes.value.employments?.[0]?.id;
  if (employmentId) {
    const empDetails = await api("GET", `employee/employment/details?employmentId=${employmentId}&fields=*,occupationCode(*)`);
    console.log("\n=== EMPLOYMENT DETAILS ===");
    console.log(JSON.stringify(empDetails.values, null, 2));
  }

  // Also read the employment itself
  const empEmployment = await api("GET", `employee/employment?employeeId=${employeeId}&fields=*`);
  console.log("\n=== EMPLOYMENT ===");
  console.log(JSON.stringify(empEmployment.values, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
