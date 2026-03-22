const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (res.status >= 400) {
    console.error("ERROR:", JSON.stringify(data, null, 2));
    throw new Error(`${method} ${path} failed with ${res.status}`);
  }
  return data;
}

async function main() {
  // Reproduce exact production flow with hardcoded occ code (4 calls)
  // Step 1: parallel division + department
  const [divRes, deptRes] = await Promise.all([
    api("GET", "/division?count=1&fields=id"),
    api("POST", "/department", { name: "TestProduksjon" + Date.now() }),
  ]);

  const divId = divRes?.values?.[0]?.id;
  const deptId = deptRes?.value?.id;
  console.log("Division:", divId ?? "none", "Department:", deptId);

  // Step 2: POST /employee with hardcoded occ code 3544
  const empRes = await api("POST", "/employee", {
    firstName: "TestCarmen",
    lastName: "TestPérez",
    dateOfBirth: "1988-05-19",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [
      {
        startDate: "2026-12-02",
        ...(divId ? { division: { id: divId } } : {}),
        employmentDetails: [
          {
            date: "2026-12-02",
            employmentType: "ORDINARY",
            employmentForm: "PERMANENT",
            remunerationType: "NOT_CHOSEN",
            workingHoursScheme: "NOT_SHIFT",
            percentageOfFullTimeEquivalent: 80,
            annualSalary: 780000,
            occupationCode: { id: 3544 },
          },
        ],
      },
    ],
  });

  const empId = empRes?.value?.id;
  console.log("Employee created:", empId);

  // Step 3: POST /employee/standardTime
  const stdRes = await api("POST", "/employee/standardTime", {
    employee: { id: empId },
    fromDate: "2026-12-02",
    hoursPerDay: 6.0,
  });
  console.log("Standard time:", stdRes?.value?.hoursPerDay);

  // Verify: read back employee with expanded fields
  const verifyRes = await api("GET", `/employee/${empId}?fields=id,firstName,lastName,dateOfBirth,department,employments(startDate,employmentDetails(date,employmentType,employmentForm,remunerationType,workingHoursScheme,percentageOfFullTimeEquivalent,annualSalary,occupationCode))`);
  const emp = verifyRes?.value;
  console.log("\n=== VERIFICATION ===");
  console.log("Name:", emp?.firstName, emp?.lastName);
  console.log("DOB:", emp?.dateOfBirth);
  console.log("Department:", JSON.stringify(emp?.department));
  const det = emp?.employments?.[0]?.employmentDetails?.[0];
  console.log("Employment form:", det?.employmentForm);
  console.log("Remuneration:", det?.remunerationType);
  console.log("Percentage:", det?.percentageOfFullTimeEquivalent);
  console.log("Salary:", det?.annualSalary);
  console.log("Occupation code:", JSON.stringify(det?.occupationCode));

  // Read back standard time
  const stdVerify = await api("GET", `/employee/standardTime?employeeId=${empId}&fields=hoursPerDay,fromDate`);
  console.log("Standard time readback:", JSON.stringify(stdVerify?.values));

  console.log("\n4-call path (with hardcoded occ code 3544) verified successfully.");

  // Cleanup: delete test employee
  await api("DELETE", `/employee/${empId}`);
  console.log("Cleaned up test employee.");
}

main().catch(e => { console.error(e); process.exit(1); });
