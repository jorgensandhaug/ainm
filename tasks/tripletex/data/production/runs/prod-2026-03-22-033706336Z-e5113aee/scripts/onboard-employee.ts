const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "yphANbyvmFVnjLX_jCneWbqulNt2vaDRsobjcqwrG9M";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

// Step 1: parallel — GET division + POST department
const [divRes, deptRes] = await Promise.all([
  get("/division?count=1&fields=id"),
  post("/department", { name: "Økonomi" }),
]);

const divisionId = divRes.count > 0 ? divRes.values[0].id : null;
const departmentId = deptRes.value.id;
console.log("division:", divisionId, "department:", departmentId);

// Step 2: POST /employee
const employment: any = {
  startDate: "2026-12-17",
  employmentDetails: [
    {
      date: "2026-12-17",
      employmentType: "ORDINARY",
      employmentForm: "PERMANENT",
      remunerationType: "MONTHLY_WAGE",
      workingHoursScheme: "NOT_SHIFT",
      percentageOfFullTimeEquivalent: 100,
      annualSalary: 810000,
      occupationCode: { id: 4679 },
    },
  ],
};
if (divisionId) employment.division = { id: divisionId };

const empBody: any = {
  firstName: "Leon",
  lastName: "Richter",
  dateOfBirth: "1989-08-17",
  userType: "NO_ACCESS",
  department: { id: departmentId },
  employments: [employment],
};

const empRes = await post("/employee", empBody);
const empId = empRes.value.id;
console.log("employee:", empId);

// Step 3: POST /employee/standardTime
const stRes = await post("/employee/standardTime", {
  employee: { id: empId },
  fromDate: "2026-12-17",
  hoursPerDay: 7.5,
});
console.log("standardTime:", stRes.value.id);

console.log("DONE — 4 calls, 0 errors expected");
