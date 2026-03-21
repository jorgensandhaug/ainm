const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "tllK2Ody-Jzzz3Jmilc3FA09sOl9hyCkb4PZC0nG_Z0";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log(text); throw new Error(`${r.status} ${path}`); }
  return JSON.parse(text);
}

// Step 1: parallel prereqs
const [divRes, deptRes, occRes] = await Promise.all([
  api("GET", "/division?count=1&fields=id"),
  api("POST", "/department", { name: "Økonomi", departmentNumber: "1" }),
  api("GET", "/employee/employment/occupationCode?nameNO=regnskapssjef&count=1&fields=id"),
]);

const divisionId = divRes.values?.[0]?.id;
const departmentId = deptRes.value.id;
const occupationCodeId = occRes.values?.[0]?.id;
console.log(`division=${divisionId}, department=${departmentId}, occupationCode=${occupationCodeId}`);

if (!occupationCodeId) throw new Error("No occupation code found for regnskapssjef");

// Step 2: create employee with nested employment + employmentDetails
const employeePayload: any = {
  firstName: "Leon",
  lastName: "Richter",
  dateOfBirth: "1989-08-17",
  userType: "NO_ACCESS",
  department: { id: departmentId },
  employments: [
    {
      startDate: "2026-12-17",
      ...(divisionId ? { division: { id: divisionId } } : {}),
      employmentDetails: [
        {
          date: "2026-12-17",
          employmentType: "ORDINARY",
          employmentForm: "PERMANENT",
          remunerationType: "MONTHLY_WAGE",
          workingHoursScheme: "NOT_SHIFT",
          percentageOfFullTimeEquivalent: 100,
          annualSalary: 810000,
          occupationCode: { id: occupationCodeId },
        },
      ],
    },
  ],
};

const empRes = await api("POST", "/employee", employeePayload);
const employeeId = empRes.value.id;
console.log(`employee created id=${employeeId}`);

// Step 3: set standard worktime
const stdTimeRes = await api("POST", "/employee/standardTime", {
  employee: { id: employeeId },
  fromDate: "2026-12-17",
  hoursPerDay: 7.5,
});
console.log("standardTime created", stdTimeRes.value?.id);

console.log("DONE — 5 calls total");
