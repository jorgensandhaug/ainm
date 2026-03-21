const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "lIZhcghiRCrIkagVEk95t-XKWpHERPxQOGHjGb9t7Ig";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const res = await fetch(url, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`Status: ${res.status}`);
  if (res.status >= 400) {
    console.log("Error:", JSON.stringify(json, null, 2));
  }
  return { status: res.status, data: json };
}

async function main() {
  // Step 1: GET /division and POST /department in parallel
  const [divRes, deptRes] = await Promise.all([
    api("GET", "/division?count=1&fields=id"),
    api("POST", "/department", { name: "Markedsføring" }),
  ]);

  const divisionId = divRes.data?.values?.[0]?.id;
  const departmentId = deptRes.data?.value?.id;

  if (!departmentId) {
    console.error("Failed to create department");
    return;
  }

  console.log("Division ID:", divisionId ?? "none (fresh account)");
  console.log("Department ID:", departmentId);

  // Step 2: POST /employee with all contract details
  const employeePayload: any = {
    firstName: "William",
    lastName: "Johnson",
    dateOfBirth: "1990-02-20",
    nationalIdentityNumber: "20029047368",
    email: "william.johnson@example.org",
    bankAccountNumber: "64387484939",
    userType: "NO_ACCESS",
    department: { id: departmentId },
    employments: [
      {
        startDate: "2026-11-11",
        ...(divisionId ? { division: { id: divisionId } } : {}),
        employmentDetails: [
          {
            date: "2026-11-11",
            employmentType: "ORDINARY",
            employmentForm: "PERMANENT",
            remunerationType: "MONTHLY_WAGE",
            workingHoursScheme: "NOT_SHIFT",
            percentageOfFullTimeEquivalent: 80,
            annualSalary: 920000,
            occupationCode: { id: 2503 },
          },
        ],
      },
    ],
  };

  const empRes = await api("POST", "/employee?fields=*,employments(*)", employeePayload);

  if (empRes.status === 201) {
    console.log("Employee created successfully!");
    console.log("Employee ID:", empRes.data?.value?.id);
    console.log("First name:", empRes.data?.value?.firstName);
    console.log("Last name:", empRes.data?.value?.lastName);
    console.log("Date of birth:", empRes.data?.value?.dateOfBirth);
    console.log("Email:", empRes.data?.value?.email);
    const emp = empRes.data?.value?.employments?.[0];
    console.log("Employment start date:", emp?.startDate);
    console.log("Employment ID:", emp?.id);
  } else {
    console.error("Failed to create employee");
  }
}

main();
