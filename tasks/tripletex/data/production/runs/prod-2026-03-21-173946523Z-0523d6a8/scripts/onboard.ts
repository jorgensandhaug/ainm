const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "bf_PF8P0MEpUt829foYC4wGHMJF00PlTDCmYaW0C_5E";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} /${path} → ${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(data, null, 2)); throw new Error(`${r.status}`); }
  return data;
}

// Step 1: parallel — GET division + POST department
const [divRes, deptRes] = await Promise.all([
  api("GET", "division?count=1&fields=id"),
  api("POST", "department", { name: "Kundeservice" }),
]);

const divisionId = divRes.values?.[0]?.id;
const departmentId = deptRes.value?.id;
console.log("divisionId:", divisionId, "departmentId:", departmentId);

// Step 2: POST /employee with nested employment + employmentDetails
const employeePayload: any = {
  firstName: "Léa",
  lastName: "Martin",
  dateOfBirth: "1983-10-07",
  userType: "NO_ACCESS",
  department: { id: departmentId },
  employments: [
    {
      startDate: "2026-11-03",
      ...(divisionId ? { division: { id: divisionId } } : {}),
      employmentDetails: [
        {
          date: "2026-11-03",
          employmentType: "ORDINARY",
          employmentForm: "PERMANENT",
          remunerationType: "MONTHLY_WAGE",
          workingHoursScheme: "NOT_SHIFT",
          percentageOfFullTimeEquivalent: 100,
          annualSalary: 880000,
          occupationCode: { id: 5935 },
        },
      ],
    },
  ],
};

const empRes = await api("POST", "employee", employeePayload);
const employeeId = empRes.value?.id;
console.log("employeeId:", employeeId);

// Step 3: POST /employee/standardTime
await api("POST", "employee/standardTime", {
  employee: { id: employeeId },
  fromDate: "2026-11-03",
  hoursPerDay: 7.5,
});

console.log("Done — 4 calls total");
