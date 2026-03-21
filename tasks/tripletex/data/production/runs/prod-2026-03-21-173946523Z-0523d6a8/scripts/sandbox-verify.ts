const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
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
  if (!r.ok) { console.log(JSON.stringify(data, null, 2)); }
  return { status: r.status, data, ok: r.ok };
}

// Reproduce the exact 4-call flow from the production run
console.log("=== Sandbox verification of Seniorutvikler onboarding (4 calls) ===\n");

// Step 1: parallel — GET division + POST department
const [divRes, deptRes] = await Promise.all([
  api("GET", "division?count=1&fields=id"),
  api("POST", "department", { name: "Kundeservice-verify" }),
]);

const divisionId = divRes.data.values?.[0]?.id;
const departmentId = deptRes.data.value?.id;
console.log("divisionId:", divisionId, "departmentId:", departmentId);

// Step 2: POST /employee with nested employment + employmentDetails
// Using occupationCode id 5935 (SYSTEMUTVIKLER, hardcoded for Seniorutvikler)
const empRes = await api("POST", "employee", {
  firstName: "Léa",
  lastName: "Martin-Verify",
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
});

const employeeId = empRes.data.value?.id;
const employmentId = empRes.data.value?.employments?.[0]?.id;
console.log("employeeId:", employeeId, "employmentId:", employmentId);

// Step 3: POST /employee/standardTime
const stdRes = await api("POST", "employee/standardTime", {
  employee: { id: employeeId },
  fromDate: "2026-11-03",
  hoursPerDay: 7.5,
});

console.log("\n=== Readback verification ===\n");

// Verify employment details
const detailsRes = await api("GET", `employee/employment/details?employmentId=${employmentId}&fields=*,occupationCode(*)`);
if (detailsRes.ok) {
  const d = detailsRes.data.values?.[0];
  console.log("occupationCode.id:", d?.occupationCode?.id);
  console.log("occupationCode.nameNO:", d?.occupationCode?.nameNO);
  console.log("occupationCode.code:", d?.occupationCode?.code);
  console.log("employmentType:", d?.employmentType);
  console.log("employmentForm:", d?.employmentForm);
  console.log("remunerationType:", d?.remunerationType);
  console.log("workingHoursScheme:", d?.workingHoursScheme);
  console.log("percentageOfFullTimeEquivalent:", d?.percentageOfFullTimeEquivalent);
  console.log("annualSalary:", d?.annualSalary);
}

// Verify standard time
const stdTimeRes = await api("GET", `employee/standardTime?employeeId=${employeeId}&fields=*`);
if (stdTimeRes.ok) {
  const st = stdTimeRes.data.values?.[0];
  console.log("hoursPerDay:", st?.hoursPerDay);
  console.log("fromDate:", st?.fromDate);
}

// Verify employee department
const empReadRes = await api("GET", `employee/${employeeId}?fields=*,department(*)`);
if (empReadRes.ok) {
  console.log("department.name:", empReadRes.data.value?.department?.name);
  console.log("firstName:", empReadRes.data.value?.firstName);
  console.log("lastName:", empReadRes.data.value?.lastName);
  console.log("dateOfBirth:", empReadRes.data.value?.dateOfBirth);
}

console.log("\n=== Done ===");
