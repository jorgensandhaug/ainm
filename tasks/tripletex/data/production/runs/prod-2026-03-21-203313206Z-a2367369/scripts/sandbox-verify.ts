const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const res = await fetch(url, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} /${path} → ${res.status}`);
  if (!res.ok) {
    console.log(JSON.stringify(json, null, 2));
    throw new Error(`${res.status} on ${method} /${path}`);
  }
  return json;
}

async function main() {
  // Reproduce the exact production flow in sandbox
  const [divRes, deptRes] = await Promise.all([
    api("GET", "division?count=1&fields=id"),
    api("POST", "department", { name: "Innkjøp Sandbox Verify" }),
  ]);

  const divisionId = divRes.count > 0 ? divRes.values[0].id : null;
  const departmentId = deptRes.value.id;
  console.log(`Division id: ${divisionId}, Department id: ${departmentId}`);

  const employeePayload: any = {
    firstName: "Beatriz",
    lastName: "Martins",
    dateOfBirth: "1996-09-27",
    email: "beatriz.martins.sandbox@example.org",
    nationalIdentityNumber: "27099607063",
    bankAccountNumber: "27935644327",
    userType: "NO_ACCESS",
    department: { id: departmentId },
    employments: [
      {
        startDate: "2026-08-07",
        ...(divisionId ? { division: { id: divisionId } } : {}),
        employmentDetails: [
          {
            date: "2026-08-07",
            employmentType: "ORDINARY",
            employmentForm: "PERMANENT",
            remunerationType: "MONTHLY_WAGE",
            workingHoursScheme: "NOT_SHIFT",
            percentageOfFullTimeEquivalent: 80,
            annualSalary: 910000,
            occupationCode: { id: 2951 },
          },
        ],
      },
    ],
  };

  const empRes = await api("POST", "employee", employeePayload);
  const employeeId = empRes.value.id;
  console.log(`Employee created: ${employeeId}`);

  // Readback verification: get employee with expanded fields
  const readback = await api("GET", `employee/${employeeId}?fields=*,department(*),employments(*)`);
  console.log("\n=== EMPLOYEE READBACK ===");
  const emp = readback.value;
  console.log(`Name: ${emp.firstName} ${emp.lastName}`);
  console.log(`DOB: ${emp.dateOfBirth}`);
  console.log(`Email: ${emp.email}`);
  console.log(`NIN: ${emp.nationalIdentityNumber}`);
  console.log(`Bank: ${emp.bankAccountNumber}`);
  console.log(`Department: ${emp.department?.name} (id: ${emp.department?.id})`);

  // Get employment details
  if (emp.employments && emp.employments.length > 0) {
    const employment = emp.employments[0];
    const employmentId = employment.id;
    console.log(`\nEmployment id: ${employmentId}`);
    console.log(`Start date: ${employment.startDate}`);

    // Read employment details
    const detailsRes = await api("GET", `employee/employment/details?employmentId=${employmentId}&fields=*,occupationCode(*)`);
    if (detailsRes.values && detailsRes.values.length > 0) {
      const d = detailsRes.values[0];
      console.log("\n=== EMPLOYMENT DETAILS READBACK ===");
      console.log(`Date: ${d.date}`);
      console.log(`Employment type: ${d.employmentType}`);
      console.log(`Employment form: ${d.employmentForm}`);
      console.log(`Remuneration type: ${d.remunerationType}`);
      console.log(`Working hours scheme: ${d.workingHoursScheme}`);
      console.log(`Percentage: ${d.percentageOfFullTimeEquivalent}`);
      console.log(`Annual salary: ${d.annualSalary}`);
      console.log(`Occupation code id: ${d.occupationCode?.id}`);
      console.log(`Occupation code nameNO: ${d.occupationCode?.nameNO}`);
      console.log(`Occupation code code: ${d.occupationCode?.code}`);
    }
  }

  console.log("\n=== VERIFICATION COMPLETE ===");
}

main().catch((e) => { console.error(e); process.exit(1); });
