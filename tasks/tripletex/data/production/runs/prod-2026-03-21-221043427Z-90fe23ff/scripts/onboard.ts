const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "TqHMfsqHg2RBm1VoxRkIIfZsPs1POiHXxmoc6vjJr2M";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (res.status >= 400) { console.log(JSON.stringify(data, null, 2)); throw new Error(`${res.status}`); }
  return data;
}

async function main() {
  // Step 1: parallel - GET division + POST department
  const [divRes, deptRes] = await Promise.all([
    api("GET", "/division?count=1&fields=id"),
    api("POST", "/department", { name: "Økonomi" }),
  ]);

  const divisionId = divRes.count > 0 ? divRes.values[0].id : null;
  const departmentId = deptRes.value.id;

  // Step 2: POST employee with nested employment + employmentDetails
  const employeePayload: any = {
    firstName: "Olav",
    lastName: "Ødegård",
    dateOfBirth: "2000-03-18",
    userType: "NO_ACCESS",
    department: { id: departmentId },
    employments: [
      {
        startDate: "2026-07-24",
        ...(divisionId ? { division: { id: divisionId } } : {}),
        employmentDetails: [
          {
            date: "2026-07-24",
            employmentType: "ORDINARY",
            employmentForm: "PERMANENT",
            remunerationType: "MONTHLY_WAGE",
            workingHoursScheme: "NOT_SHIFT",
            percentageOfFullTimeEquivalent: 80,
            annualSalary: 550000,
            occupationCode: { id: 4930 },
          },
        ],
      },
    ],
  };

  const empRes = await api("POST", "/employee", employeePayload);
  const employeeId = empRes.value.id;
  console.log("Employee created, id:", employeeId);

  // Step 3: POST standard worktime (6.0 hours per day)
  await api("POST", "/employee/standardTime", {
    employee: { id: employeeId },
    fromDate: "2026-07-24",
    hoursPerDay: 6.0,
  });

  console.log("Done. 4 calls, 0 errors.");
}

main().catch((e) => { console.error(e); process.exit(1); });
