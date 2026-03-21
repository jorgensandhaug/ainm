const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (res.status >= 400) console.log(JSON.stringify(json, null, 2));
  return { status: res.status, json };
}

async function main() {
  const ts = Date.now();

  // Create department
  const deptRes = await api("POST", "/department", { name: `NoDivTest${ts}` });
  const departmentId = deptRes.json.value.id;

  // Try POST /employee WITHOUT division — sandbox has divisions
  const empRes = await api("POST", "/employee?fields=*,employments(*)", {
    firstName: "NoDivTest",
    lastName: `Test${ts}`,
    dateOfBirth: "1990-01-01",
    userType: "NO_ACCESS",
    department: { id: departmentId },
    employments: [
      {
        startDate: "2026-07-01",
        // NO division here
        employmentDetails: [
          {
            date: "2026-07-01",
            employmentType: "ORDINARY",
            employmentForm: "PERMANENT",
            remunerationType: "MONTHLY_WAGE",
            workingHoursScheme: "NOT_SHIFT",
            percentageOfFullTimeEquivalent: 100,
            annualSalary: 500000,
            occupationCode: { id: 4930 },
          },
        ],
      },
    ],
  });

  if (empRes.status === 201) {
    console.log("SUCCESS without division! Employee created.");
    console.log(`Employee id=${empRes.json.value.id}`);
  } else {
    console.log("FAILED without division — division is required on this sandbox account.");
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
