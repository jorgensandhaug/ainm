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

// 1. Verify occupation code for regnskapssjef
const occRes = await api("GET", "/employee/employment/occupationCode?nameNO=regnskapssjef&count=5&fields=*");
console.log("regnskapssjef results:", JSON.stringify(occRes?.values, null, 2));

// 2. Full onboarding test: division, department, employee, standardTime
const divRes = await api("GET", "/division?count=1&fields=id");
const divisionId = divRes?.values?.[0]?.id;
console.log(`divisionId=${divisionId}`);

const deptRes = await api("POST", "/department", { name: "Økonomi-test-reflect", departmentNumber: "99" });
const departmentId = deptRes?.value?.id;
console.log(`departmentId=${departmentId}`);

const occupationCodeId = occRes?.values?.[0]?.id;
console.log(`occupationCodeId=${occupationCodeId}`);

const empPayload: any = {
  firstName: "Leon",
  lastName: "Richter-test",
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

const empRes = await api("POST", "/employee", empPayload);
const employeeId = empRes?.value?.id;
console.log(`employeeId=${employeeId}`);

// standardTime
const stdRes = await api("POST", "/employee/standardTime", {
  employee: { id: employeeId },
  fromDate: "2026-12-17",
  hoursPerDay: 7.5,
});
console.log(`standardTimeId=${stdRes?.value?.id}`);

// Readback: employment details
const employmentId = empRes?.value?.employments?.[0]?.id;
console.log(`employmentId=${employmentId}`);
const detailsRes = await api("GET", `/employee/employment/details?employmentId=${employmentId}&fields=*,occupationCode(*)`);
console.log("employment details readback:", JSON.stringify(detailsRes?.values, null, 2));

// Readback: standard time
const stdReadRes = await api("GET", `/employee/standardTime?employeeId=${employeeId}&fields=*`);
console.log("standard time readback:", JSON.stringify(stdReadRes?.values, null, 2));
