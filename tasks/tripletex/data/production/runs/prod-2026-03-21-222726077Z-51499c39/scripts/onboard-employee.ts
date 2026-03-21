const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "Su4md7LROamxcaX2OMMH1l1iBUH12L-xIgFw0xSM2AY";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const res = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`  ${res.status}`, JSON.stringify(data));
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  // Step 1+2 in parallel: GET division + POST department
  const [divRes, deptRes] = await Promise.all([
    api("GET", "/division?count=1&fields=id"),
    api("POST", "/department", { name: "Drift" }),
  ]);

  const divisionId = divRes.count > 0 ? divRes.values[0].id : null;
  const departmentId = deptRes.value.id;

  // Step 3: POST /employee with nested employment + employmentDetails
  const employeePayload: any = {
    firstName: "Daniel",
    lastName: "Brown",
    dateOfBirth: "1994-03-05",
    nationalIdentityNumber: "05039400326",
    email: "daniel.brown@example.org",
    bankAccountNumber: "23369720074",
    userType: "NO_ACCESS",
    department: { id: departmentId },
    employments: [
      {
        startDate: "2026-10-11",
        ...(divisionId ? { division: { id: divisionId } } : {}),
        employmentDetails: [
          {
            date: "2026-10-11",
            employmentType: "ORDINARY",
            employmentForm: "PERMANENT",
            remunerationType: "MONTHLY_WAGE",
            workingHoursScheme: "NOT_SHIFT",
            percentageOfFullTimeEquivalent: 100,
            annualSalary: 520000,
            occupationCode: { id: 2951 },
          },
        ],
      },
    ],
  };

  const empRes = await api("POST", "/employee?fields=*,employments(*)", employeePayload);
  const employeeId = empRes.value.id;
  console.log("Created employee id:", employeeId);

  // Step 4: POST /employee/standardTime (7.5h default)
  await api("POST", "/employee/standardTime", {
    employee: { id: employeeId },
    fromDate: "2026-10-11",
    hoursPerDay: 7.5,
  });

  console.log("Done. 4 calls, employee id:", employeeId);
}

main().catch((e) => { console.error(e); process.exit(1); });
