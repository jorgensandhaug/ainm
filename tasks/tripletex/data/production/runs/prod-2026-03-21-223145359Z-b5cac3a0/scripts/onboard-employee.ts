const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "lrFulTzXXwRRM3_z7Pumh215kCZxzW5KkBRDUjGz5ZE";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) { console.log(JSON.stringify(data, null, 2)); throw new Error(`${res.status}`); }
  return data;
}

async function main() {
  // Step 1: parallel — GET division + POST department
  const [divRes, deptRes] = await Promise.all([
    api("GET", "/division?count=1&fields=id"),
    api("POST", "/department", { name: "Økonomi" }),
  ]);

  const divisionId = divRes.count > 0 ? divRes.values[0].id : null;
  const departmentId = deptRes.value.id;

  // Step 2: POST employee with nested employment + employmentDetails
  const employeePayload: any = {
    firstName: "Catarina",
    lastName: "Oliveira",
    dateOfBirth: "1990-02-26",
    userType: "NO_ACCESS",
    department: { id: departmentId },
    employments: [
      {
        startDate: "2026-06-26",
        ...(divisionId ? { division: { id: divisionId } } : {}),
        employmentDetails: [
          {
            date: "2026-06-26",
            employmentType: "ORDINARY",
            employmentForm: "PERMANENT",
            remunerationType: "MONTHLY_WAGE",
            workingHoursScheme: "NOT_SHIFT",
            percentageOfFullTimeEquivalent: 100,
            annualSalary: 610000,
            occupationCode: { id: 4169 },
          },
        ],
      },
    ],
  };

  const empRes = await api("POST", "/employee", employeePayload);
  const employeeId = empRes.value.id;
  console.log("Employee created, id:", employeeId);

  // Step 3: POST standard worktime
  await api("POST", "/employee/standardTime", {
    employee: { id: employeeId },
    fromDate: "2026-06-26",
    hoursPerDay: 7.5,
  });

  console.log("Done. 4 calls total.");
}

main().catch((e) => { console.error(e); process.exit(1); });
