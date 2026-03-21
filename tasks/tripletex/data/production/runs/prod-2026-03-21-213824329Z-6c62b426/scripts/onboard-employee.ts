const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "IpEKP4HqoVmXlax-Vz88iPejtfu0LuUlR0_VJ4MYW8E";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function get(path: string) {
  const url = `${BASE}/${path}`;
  console.log(`GET ${url}`);
  const r = await fetch(url, { headers: H });
  const body = await r.text();
  console.log(`  ${r.status} ${body.slice(0, 500)}`);
  return { status: r.status, data: JSON.parse(body) };
}

async function post(path: string, payload: any) {
  const url = `${BASE}/${path}`;
  console.log(`POST ${url}`);
  console.log(`  body: ${JSON.stringify(payload).slice(0, 500)}`);
  const r = await fetch(url, { method: "POST", headers: H, body: JSON.stringify(payload) });
  const body = await r.text();
  console.log(`  ${r.status} ${body.slice(0, 800)}`);
  return { status: r.status, data: JSON.parse(body) };
}

async function main() {
  // Step 1: parallel - GET division + POST department
  const [divRes, deptRes] = await Promise.all([
    get("division?count=1&fields=id"),
    post("department", { name: "Kundeservice" }),
  ]);

  // Extract division id (may be 0 rows on fresh accounts)
  const divisionId = divRes.data?.values?.[0]?.id ?? null;
  const departmentId = deptRes.data?.value?.id;

  if (!departmentId) {
    console.error("FATAL: department creation failed");
    process.exit(1);
  }

  console.log(`Division ID: ${divisionId}, Department ID: ${departmentId}`);

  // Step 2: POST /employee with all contract data
  const employeePayload: any = {
    firstName: "Isabel",
    lastName: "García",
    dateOfBirth: "1980-02-14",
    nationalIdentityNumber: "14028013567",
    email: "isabel.garcia@example.org",
    bankAccountNumber: "97208097079",
    userType: "NO_ACCESS",
    department: { id: departmentId },
    employments: [
      {
        startDate: "2026-07-13",
        ...(divisionId ? { division: { id: divisionId } } : {}),
        employmentDetails: [
          {
            date: "2026-07-13",
            employmentType: "ORDINARY",
            employmentForm: "PERMANENT",
            remunerationType: "MONTHLY_WAGE",
            workingHoursScheme: "NOT_SHIFT",
            percentageOfFullTimeEquivalent: 80,
            annualSalary: 640000,
            occupationCode: { id: 4672 },
          },
        ],
      },
    ],
  };

  const empRes = await post("employee", employeePayload);

  if (empRes.status === 201) {
    console.log("Employee created successfully.");
    const empId = empRes.data?.value?.id;
    console.log(`Employee ID: ${empId}`);
  } else {
    console.error("FATAL: employee creation failed");
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
