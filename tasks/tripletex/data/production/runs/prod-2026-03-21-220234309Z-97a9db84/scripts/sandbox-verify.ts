const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (res.status >= 400) console.log(JSON.stringify(json, null, 2));
  return { status: res.status, json };
}

async function main() {
  // Replicate the exact production flow for Salgssjef + standard worktime
  const ts = Date.now();

  // Step 1: Parallel prereqs
  const [divRes, deptRes] = await Promise.all([
    api("GET", "/division?count=1&fields=id"),
    api("POST", "/department", { name: `SandboxRegnskap${ts}` }),
  ]);

  const divisionId = divRes.json.count > 0 ? divRes.json.values[0].id : null;
  const departmentId = deptRes.json.value.id;
  console.log(`Division: ${divisionId}, Department: ${departmentId}`);

  // Step 2: POST /employee with full nested employment details
  const empPayload: any = {
    firstName: "SandboxLars",
    lastName: `Strand${ts}`,
    dateOfBirth: "1982-08-04",
    userType: "NO_ACCESS",
    department: { id: departmentId },
    employments: [
      {
        startDate: "2026-06-24",
        ...(divisionId ? { division: { id: divisionId } } : {}),
        employmentDetails: [
          {
            date: "2026-06-24",
            employmentType: "ORDINARY",
            employmentForm: "PERMANENT",
            remunerationType: "MONTHLY_WAGE",
            workingHoursScheme: "NOT_SHIFT",
            percentageOfFullTimeEquivalent: 100,
            annualSalary: 800000,
            occupationCode: { id: 4930 },
          },
        ],
      },
    ],
  };

  const empRes = await api("POST", "/employee?fields=*,employments(*)", empPayload);
  if (empRes.status !== 201) { console.error("Employee create failed"); return; }
  const employeeId = empRes.json.value.id;
  const employment = empRes.json.value.employments?.[0];
  console.log(`Employee id=${employeeId}, firstName=${empRes.json.value.firstName}, lastName=${empRes.json.value.lastName}`);
  console.log(`Employment startDate=${employment?.startDate}, id=${employment?.id}`);

  // Step 3: POST /employee/standardTime
  const stRes = await api("POST", "/employee/standardTime", {
    employee: { id: employeeId },
    fromDate: "2026-06-24",
    hoursPerDay: 7.5,
  });
  if (stRes.status !== 201) { console.error("Standard time create failed"); return; }
  console.log(`StandardTime hoursPerDay=${stRes.json.value?.hoursPerDay}`);

  // Readback verification
  console.log("\n=== READBACK VERIFICATION ===");

  // Read employment details
  const detailsRes = await api("GET", `/employee/employment/details?employmentId=${employment.id}&fields=*,occupationCode(*)`);
  if (detailsRes.status === 200 && detailsRes.json.count > 0) {
    const d = detailsRes.json.values[0];
    console.log(`employmentType=${d.employmentType}`);
    console.log(`employmentForm=${d.employmentForm}`);
    console.log(`remunerationType=${d.remunerationType}`);
    console.log(`workingHoursScheme=${d.workingHoursScheme}`);
    console.log(`percentageOfFullTimeEquivalent=${d.percentageOfFullTimeEquivalent}`);
    console.log(`annualSalary=${d.annualSalary}`);
    console.log(`occupationCode.id=${d.occupationCode?.id}, nameNO=${d.occupationCode?.nameNO}, code=${d.occupationCode?.code}`);
  }

  // Read standard time
  const stReadRes = await api("GET", `/employee/standardTime?employeeId=${employeeId}&fields=*`);
  if (stReadRes.status === 200 && stReadRes.json.count > 0) {
    const st = stReadRes.json.values[0];
    console.log(`standardTime: hoursPerDay=${st.hoursPerDay}, fromDate=${st.fromDate}`);
  }

  console.log("\n4 write/read calls completed (+ 2 readback GETs for verification only)");
}

main().catch(e => { console.error(e.message); process.exit(1); });
