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
  // Create a new department for this test
  const [divRes, deptRes] = await Promise.all([
    get("division?count=1&fields=id"),
    post("department", { name: "Kundeservice-stdtime-test" }),
  ]);

  const divisionId = divRes.data?.values?.[0]?.id ?? null;
  const departmentId = deptRes.data?.value?.id;

  // Create employee - same as production, STYRK 3313
  const empRes = await post("employee", {
    firstName: "Isabel",
    lastName: "García-StdTime",
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
  });

  const employeeId = empRes.data?.value?.id;
  console.log(`Employee ID: ${employeeId}`);

  // Now also set standard worktime 7.5 hours/day
  if (employeeId) {
    const stdTimeRes = await post("employee/standardTime", {
      employee: { id: employeeId },
      fromDate: "2026-07-13",
      hoursPerDay: 7.5,
    });
    console.log(`Standard time created`);

    // Readback standard time
    const stdTimeRead = await get(`employee/standardTime?employeeIds=${employeeId}&fields=*`);

    // Full employment details readback
    const empEmployment = await get(`employee/employment?employeeId=${employeeId}&fields=*`);
    const employmentId = empEmployment.data?.values?.[0]?.id;
    if (employmentId) {
      const empDetails = await get(`employee/employment/details?employmentId=${employmentId}&fields=*,occupationCode(*)`);
    }
  }

  // Also try: look at what occupation codes are available for 3313-related searches
  console.log("\n=== OCCUPATION CODE INVESTIGATION ===");
  // Check all regnskaps-related codes
  const occRes = await get("employee/employment/occupationCode?nameNO=regnskap&count=20&fields=id,nameNO,code");

  // Also check if there are any 3313-specific codes
  console.log("\n=== code=3313 search ===");
  const occCode = await get("employee/employment/occupationCode?code=3313&count=20&fields=id,nameNO,code");

  // Also check for 'bokhold' related codes
  console.log("\n=== nameNO=bokhold search ===");
  const bokRes = await get("employee/employment/occupationCode?nameNO=bokhold&count=20&fields=id,nameNO,code");
}

main().catch((e) => { console.error(e); process.exit(1); });
