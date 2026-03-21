const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log(text); return null; }
  return JSON.parse(text);
}

// Test with correct id 4679 (REGNSKAPSSJEF) instead of 2881 (KONSERNREGNSKAPSSJEF)
const divRes = await api("GET", "/division?count=1&fields=id");
const divisionId = divRes?.values?.[0]?.id;

const deptRes = await api("POST", "/department", { name: "Økonomi-correct-test", departmentNumber: "98" });
const departmentId = deptRes?.value?.id;

const empPayload: any = {
  firstName: "Leon",
  lastName: "Richter-correct",
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
          occupationCode: { id: 4679 },  // REGNSKAPSSJEF, not KONSERNREGNSKAPSSJEF
        },
      ],
    },
  ],
};

const empRes = await api("POST", "/employee", empPayload);
const employeeId = empRes?.value?.id;
const employmentId = empRes?.value?.employments?.[0]?.id;

const stdRes = await api("POST", "/employee/standardTime", {
  employee: { id: employeeId },
  fromDate: "2026-12-17",
  hoursPerDay: 7.5,
});

// Readback
const detailsRes = await api("GET", `/employee/employment/details?employmentId=${employmentId}&fields=*,occupationCode(*)`);
console.log("CORRECT employment details readback:", JSON.stringify(detailsRes?.values?.[0]?.occupationCode, null, 2));
console.log("annualSalary:", detailsRes?.values?.[0]?.annualSalary);
console.log("percentageOfFullTimeEquivalent:", detailsRes?.values?.[0]?.percentageOfFullTimeEquivalent);
console.log("employmentForm:", detailsRes?.values?.[0]?.employmentForm);
