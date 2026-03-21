const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "cdVtq2O69LRAt7IXN5qTj9emRSaLle8EYUSzXxFwshE";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (res.status >= 400) {
    console.log(JSON.stringify(json, null, 2));
    throw new Error(`${method} ${path} failed with ${res.status}`);
  }
  return json;
}

async function main() {
  // Step 1: Resolve prerequisites in parallel
  const [divRes, deptRes] = await Promise.all([
    api("GET", "/division?count=1&fields=id"),
    api("POST", "/department", { name: "Regnskap" }),
  ]);

  const divisionId = divRes.count > 0 ? divRes.values[0].id : null;
  const departmentId = deptRes.value.id;
  console.log(`Division: ${divisionId}, Department: ${departmentId}`);

  // Step 2: POST /employee with full nested employment details
  const employeePayload: any = {
    firstName: "Lars",
    lastName: "Strand",
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

  const empRes = await api("POST", "/employee?fields=*,employments(*)", employeePayload);
  const employeeId = empRes.value.id;
  console.log(`Employee created: id=${employeeId}, name=${empRes.value.firstName} ${empRes.value.lastName}`);
  console.log(`Employment startDate: ${empRes.value.employments?.[0]?.startDate}`);

  // Step 3: POST /employee/standardTime
  const stRes = await api("POST", "/employee/standardTime", {
    employee: { id: employeeId },
    fromDate: "2026-06-24",
    hoursPerDay: 7.5,
  });
  console.log(`Standard time created: hoursPerDay=${stRes.value?.hoursPerDay}`);

  console.log("\nDone. 4 calls, 0 errors.");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
