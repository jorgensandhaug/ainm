const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "Q7MWC7IXFFu8dvgndqeffT2J-W9QWyQzfy1MG1_UAuc";
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
  // Step 1: parallel prereqs — GET division + POST department
  const [divRes, deptRes] = await Promise.all([
    api("GET", "division?count=1&fields=id"),
    api("POST", "department", { name: "Innkjøp" }),
  ]);

  const divisionId = divRes.count > 0 ? divRes.values[0].id : null;
  const departmentId = deptRes.value.id;

  // Step 2: POST /employee with full nested employment details
  const employeePayload: any = {
    firstName: "Beatriz",
    lastName: "Martins",
    dateOfBirth: "1996-09-27",
    email: "beatriz.martins@example.org",
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
  console.log("Employee created:", empRes.value.id);
  console.log("Done — 3 calls, 0 errors");
}

main().catch((e) => { console.error(e); process.exit(1); });
