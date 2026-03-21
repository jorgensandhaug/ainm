const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function get(path: string) {
  const url = `${BASE}/${path}`;
  console.log(`GET ${url}`);
  const r = await fetch(url, { headers: H });
  const body = await r.text();
  console.log(`  ${r.status} ${body.slice(0, 2000)}`);
  return { status: r.status, data: JSON.parse(body) };
}

async function post(path: string, payload: any) {
  const url = `${BASE}/${path}`;
  console.log(`POST ${url}`);
  const r = await fetch(url, { method: "POST", headers: H, body: JSON.stringify(payload) });
  const body = await r.text();
  console.log(`  ${r.status} ${body.slice(0, 2000)}`);
  return { status: r.status, data: JSON.parse(body) };
}

async function main() {
  // Step 1: Prerequisites
  const [divRes, deptRes] = await Promise.all([
    get("division?count=1&fields=id"),
    post("department", { name: "Kundeservice-test-10" }),
  ]);

  const divisionId = divRes.data?.values?.[0]?.id ?? null;
  const departmentId = deptRes.data?.value?.id;
  console.log(`Division: ${divisionId}, Department: ${departmentId}`);

  // Step 2: Create employee with all contract fields
  const employeePayload: any = {
    firstName: "Isabel",
    lastName: "García",
    dateOfBirth: "1980-02-14",
    nationalIdentityNumber: "14028013567",
    email: "isabel.garcia@example.org",
    bankAccountNumber: "97208097079",
    userType: "NO_ACCESS",
    department: { id: departmentId },
    employments: [
      {
        startDate: "2026-07-13",
        ...(divisionId ? { division: { id: divisionId } } : {}),
        employmentDetails: [
          {
            date: "2026-07-13",
            employmentType: "ORDINARY",
            employmentForm: "PERMANENT",
            remunerationType: "MONTHLY_WAGE",
            workingHoursScheme: "NOT_SHIFT",
            percentageOfFullTimeEquivalent: 80,
            annualSalary: 640000,
            occupationCode: { id: 4672 },
          },
        ],
      },
    ],
  };

  const empRes = await post("employee", employeePayload);
  const employeeId = empRes.data?.value?.id;
  console.log(`Employee ID: ${employeeId}`);

  if (!employeeId) {
    console.error("Employee creation failed, stopping");
    return;
  }

  // Step 3: Full readback of the employee
  console.log("\n=== FULL EMPLOYEE READBACK ===");
  const empRead = await get(`employee/${employeeId}?fields=*`);

  // Step 4: Read employment
  console.log("\n=== EMPLOYMENT READBACK ===");
  const empEmployment = await get(`employee/employment?employeeId=${employeeId}&fields=*`);

  // Get employment id
  const employmentId = empEmployment.data?.values?.[0]?.id;
  console.log(`Employment ID: ${employmentId}`);

  if (employmentId) {
    // Step 5: Read employment details
    console.log("\n=== EMPLOYMENT DETAILS READBACK ===");
    const empDetails = await get(`employee/employment/details?employmentId=${employmentId}&fields=*,occupationCode(*)`);

    // Step 6: Check standard time
    console.log("\n=== STANDARD TIME READBACK ===");
    const stdTime = await get(`employee/standardTime?employeeIds=${employeeId}&fields=*`);
  }

  // Step 7: Check what the employee search returns for this employee
  console.log("\n=== EMPLOYEE SEARCH ===");
  const empSearch = await get(`employee?id=${employeeId}&fields=*,department(*),employments(*)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
