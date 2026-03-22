const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "BNC6YCHYpbXQsooXDcUZe-qB2KE9TJT-yxDXDAjsCfs";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  if (!r.ok) {
    console.error(`${method} ${path} → ${r.status}: ${text}`);
    throw new Error(`${r.status}`);
  }
  return JSON.parse(text);
}

async function main() {
  // Step 1 (parallel): GET division + POST department
  const [divRes, deptRes] = await Promise.all([
    api("GET", "division?count=1&fields=id"),
    api("POST", "department", { name: "Regnskap" }),
  ]);

  const divId = divRes.count > 0 ? divRes.values[0].id : null;
  const deptId = deptRes.value.id;
  console.log("division id:", divId, "department id:", deptId);

  // Step 2: POST employee (tilbudsbrev payload — NOT_CHOSEN for employmentType and workingHoursScheme)
  const employment: any = {
    startDate: "2026-12-06",
    employmentDetails: [
      {
        date: "2026-12-06",
        employmentType: "NOT_CHOSEN",
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_CHOSEN",
        percentageOfFullTimeEquivalent: 100,
        annualSalary: 620000,
        occupationCode: { id: 4679 },
      },
    ],
  };
  if (divId) employment.division = { id: divId };

  const empRes = await api("POST", "employee", {
    firstName: "Lucía",
    lastName: "González",
    dateOfBirth: "1983-01-31",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [employment],
  });

  const empId = empRes.value.id;
  console.log("employee id:", empId);

  // Step 3: POST /employee/standardTime
  const stRes = await api("POST", "employee/standardTime", {
    employee: { id: empId },
    fromDate: "2026-12-06",
    hoursPerDay: 7.5,
  });
  console.log("standardTime id:", stRes.value.id);

  console.log("DONE — 4 calls (3 if no division), 0 errors expected");
}

main().catch((e) => { console.error(e); process.exit(1); });
