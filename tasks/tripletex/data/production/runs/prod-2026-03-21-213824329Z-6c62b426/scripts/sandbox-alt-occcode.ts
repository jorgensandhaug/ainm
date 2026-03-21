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
  // EXPERIMENT 1: Use REGNSKAPSMEDARBEIDER (id 4677, code 4121115) instead of REGNSKAPSFØRER (id 4672)
  // STYRK-08 3313 = "Regnskapsmedarbeidere og bokholdere" - REGNSKAPSMEDARBEIDER is more literal match

  const [divRes, deptRes] = await Promise.all([
    get("division?count=1&fields=id"),
    post("department", { name: "Kundeservice-altcode-test" }),
  ]);

  const divisionId = divRes.data?.values?.[0]?.id;
  const departmentId = deptRes.data?.value?.id;

  const empRes = await post("employee", {
    firstName: "TestAlt",
    lastName: "CodeTest",
    dateOfBirth: "1980-02-14",
    nationalIdentityNumber: "14028013567",
    email: "test@example.org",
    bankAccountNumber: "97208097079",
    userType: "NO_ACCESS",
    department: { id: departmentId },
    employments: [
      {
        startDate: "2026-07-13",
        division: { id: divisionId },
        employmentDetails: [
          {
            date: "2026-07-13",
            employmentType: "ORDINARY",
            employmentForm: "PERMANENT",
            remunerationType: "MONTHLY_WAGE",
            workingHoursScheme: "NOT_SHIFT",
            percentageOfFullTimeEquivalent: 80,
            annualSalary: 640000,
            occupationCode: { id: 4677 },  // REGNSKAPSMEDARBEIDER instead of REGNSKAPSFØRER
          },
        ],
      },
    ],
  });

  const employeeId = empRes.data?.value?.id;
  console.log(`Employee ID: ${employeeId}`);

  if (employeeId) {
    // Readback employment details
    const empEmployment = await get(`employee/employment?employeeId=${employeeId}&fields=*`);
    const employmentId = empEmployment.data?.values?.[0]?.id;
    if (employmentId) {
      const empDetails = await get(`employee/employment/details?employmentId=${employmentId}&fields=*,occupationCode(*)`);
      console.log("\n=== COMPARISON ===");
      console.log("REGNSKAPSMEDARBEIDER (id 4677): code should be 4121115");
      console.log("REGNSKAPSFØRER (id 4672): code is 3432101");
      console.log("STYRK-08 3313 literally translates to 'Regnskapsmedarbeidere og bokholdere'");
    }

    // EXPERIMENT 2: Also set standard worktime 7.5
    const stdTimeRes = await post("employee/standardTime", {
      employee: { id: employeeId },
      fromDate: "2026-07-13",
      hoursPerDay: 7.5,
    });

    // Verify standard time via byDate
    await get(`employee/standardTime/byDate?employeeId=${employeeId}&date=2026-07-13&fields=*`);
  }

  // Also look at all 3313-relevant codes more carefully
  console.log("\n=== ALL STYRK-98 3432 codes (Regnskapsførere group) ===");
  await get("employee/employment/occupationCode?code=3432&count=20&fields=id,nameNO,code");

  console.log("\n=== ALL STYRK-98 4121 codes (Regnskapsmedarbeidere group) ===");
  await get("employee/employment/occupationCode?code=4121&count=20&fields=id,nameNO,code");
}

main().catch((e) => { console.error(e); process.exit(1); });
