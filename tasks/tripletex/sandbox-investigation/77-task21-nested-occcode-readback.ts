// Task 21 Check 5 - Test how the scorer might read occupationCode
//
// The scorer probably does a GET on the employee and checks fields.
// Let's see how occupationCode comes back when read through different paths:
//   Path A: GET /employee/{id}?fields=employments(employmentDetails(occupationCode(*)))
//   Path B: GET /employee/employment?employeeId=...&fields=employmentDetails(occupationCode(*))
//   Path C: GET /employee/employment/details?employmentId=...&fields=occupationCode(*)
//
// Also: what if there's a "default" employmentDetails row that gets created
// automatically alongside our nested one? Let's check if there are MULTIPLE
// detail rows.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 500));
  return { status: res.status, data: json };
}

function val(r: { data: any }) {
  if (r.data?.values !== undefined) return r.data.values;
  if (r.data?.value !== undefined) return r.data.value;
  return r.data;
}

async function main() {
  const divRes = await api("GET", "/division?count=1&fields=id");
  const divId = val(divRes)?.[0]?.id;

  const deptRes = await api("POST", "/department", { name: "ReadbackTest" });
  const deptId = val(deptRes)?.id;

  // Create standard task 21 employee
  const empRes = await api("POST", "/employee", {
    firstName: "Readback",
    lastName: "TestG",
    dateOfBirth: "2000-03-18",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{
      startDate: "2026-07-24",
      division: { id: divId },
      employmentDetails: [{
        date: "2026-07-24",
        employmentType: "ORDINARY",
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 80,
        annualSalary: 550000,
        occupationCode: { id: 4930 },
      }],
    }],
  });
  const emp = val(empRes);
  const empId = emp?.id;
  const emplId = emp?.employments?.[0]?.id;

  await api("POST", "/employee/standardTime", {
    employee: { id: empId },
    fromDate: "2026-07-24",
    hoursPerDay: 6.0,
  });

  console.log("\n" + "=".repeat(80));
  console.log("PATH A: Deep nested read from /employee");
  console.log("=".repeat(80));

  const pathA = await api("GET",
    `/employee/${empId}?fields=id,firstName,lastName,dateOfBirth,department(id,name),employments(id,startDate,division(id),isMainEmployer,taxDeductionCode,employmentDetails(id,date,employmentType,employmentForm,remunerationType,workingHoursScheme,percentageOfFullTimeEquivalent,annualSalary,occupationCode(*)))`
  );
  console.log("PATH A result:", JSON.stringify(val(pathA), null, 2));

  console.log("\n" + "=".repeat(80));
  console.log("PATH B: Read from /employee/employment");
  console.log("=".repeat(80));

  const pathB = await api("GET",
    `/employee/employment?employeeId=${empId}&fields=id,startDate,division(id),isMainEmployer,taxDeductionCode,employmentDetails(id,date,employmentType,employmentForm,remunerationType,workingHoursScheme,percentageOfFullTimeEquivalent,annualSalary,occupationCode(*))`
  );
  console.log("PATH B result:", JSON.stringify(val(pathB), null, 2));

  console.log("\n" + "=".repeat(80));
  console.log("PATH C: Read from /employee/employment/details");
  console.log("=".repeat(80));

  const pathC = await api("GET",
    `/employee/employment/details?employmentId=${emplId}&fields=id,date,employmentType,employmentForm,remunerationType,workingHoursScheme,percentageOfFullTimeEquivalent,annualSalary,occupationCode(*)`
  );
  console.log("PATH C result:", JSON.stringify(val(pathC), null, 2));

  console.log("\n" + "=".repeat(80));
  console.log("PATH D: Read standard time");
  console.log("=".repeat(80));

  const pathD = await api("GET",
    `/employee/standardTime?employeeId=${empId}&fields=id,fromDate,hoursPerDay`
  );
  console.log("PATH D result:", JSON.stringify(val(pathD), null, 2));

  console.log("\n" + "=".repeat(80));
  console.log("PATH E: /employee with latestSalary field");
  console.log("=".repeat(80));

  const pathE = await api("GET",
    `/employee/employment/${emplId}?fields=latestSalary(*)`
  );
  console.log("PATH E (latestSalary):", JSON.stringify(val(pathE), null, 2));

  console.log("\n" + "=".repeat(80));
  console.log("CHECK: How many employmentDetails rows exist?");
  console.log("=".repeat(80));

  const countDet = await api("GET",
    `/employee/employment/details?employmentId=${emplId}&fields=id,date`
  );
  const detList = val(countDet);
  console.log(`Number of detail rows: ${Array.isArray(detList) ? detList.length : 'unknown'}`);
  console.log("Detail rows:", JSON.stringify(detList, null, 2));

  // CRITICAL: What does the employee object look like when the POST response is used?
  console.log("\n" + "=".repeat(80));
  console.log("POST RESPONSE vs GET: Compare");
  console.log("=".repeat(80));

  // The POST /employee response
  console.log("POST response employments[0].employmentDetails:",
    JSON.stringify(emp?.employments?.[0]?.employmentDetails, null, 2));
  // Sometimes the POST response doesn't include expanded occupationCode
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
