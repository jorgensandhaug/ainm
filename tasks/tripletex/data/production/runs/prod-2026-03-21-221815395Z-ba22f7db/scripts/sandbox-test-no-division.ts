const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
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
  if (res.status >= 400) console.log("Error:", JSON.stringify(json, null, 2));
  return { status: res.status, data: json };
}

async function main() {
  // Test 1: Can POST /employee succeed WITHOUT division on sandbox that HAS divisions?
  console.log("=== Test: POST /employee WITHOUT division (sandbox has divisions) ===");

  // First create a department for this test
  const deptRes = await api("POST", "/department", { name: "NoDivTest ba22f7db" });
  const departmentId = deptRes.data?.value?.id;

  const empPayload: any = {
    firstName: "NoDivTest",
    lastName: "Employee ba22f7db",
    dateOfBirth: "1985-05-15",
    userType: "NO_ACCESS",
    department: { id: departmentId },
    employments: [
      {
        startDate: "2026-12-01",
        // NOTE: intentionally NO division here
        employmentDetails: [
          {
            date: "2026-12-01",
            employmentType: "ORDINARY",
            employmentForm: "PERMANENT",
            remunerationType: "MONTHLY_WAGE",
            workingHoursScheme: "NOT_SHIFT",
            percentageOfFullTimeEquivalent: 100,
            annualSalary: 500000,
            occupationCode: { id: 2503 },
          },
        ],
      },
    ],
  };

  const empRes = await api("POST", "/employee?fields=*,employments(*)", empPayload);

  if (empRes.status === 201) {
    console.log("\nSUCCESS: Employee created WITHOUT division on account that HAS divisions!");
    console.log("This means GET /division is unnecessary even on accounts with divisions.");
  } else if (empRes.status === 422) {
    const validationFields = empRes.data?.validationMessages?.map((v: any) => v.field);
    console.log("\nFAILED: 422 validation error");
    console.log("Validation fields:", validationFields);
    if (validationFields?.includes("employments.division.id")) {
      console.log("CONFIRMED: Division IS required on accounts that have divisions.");
      console.log("GET /division pre-read is justified.");
    }
  }
}

main();
