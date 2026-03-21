const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "IPtD9ih97NAPCYpMu4mCNEwy8faXWxS7Ayv5MR7mJrI";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const opts: RequestInit = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`${method} /${path} → ${res.status}`);
  if (!res.ok) {
    console.log("ERROR:", text);
    throw new Error(`${res.status} on ${method} /${path}: ${text}`);
  }
  if (!text) return null;
  const json = JSON.parse(text);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

// Step 1: Parallel - division, department, occupation code
const [divisions, dept, occCodes] = await Promise.all([
  api("GET", "division?count=1&fields=id"),
  api("POST", "department", { name: "Kundeservice" }),
  api("GET", "employee/employment/occupationCode?nameNO=seniorutvikler&count=1&fields=id"),
]);

const divisionId = Array.isArray(divisions) && divisions.length > 0 ? divisions[0].id : null;
const deptId = dept.id;

// Handle occupation code
let occId: number | null = null;
if (Array.isArray(occCodes) && occCodes.length > 0) {
  occId = occCodes[0].id;
} else {
  // Fallback: try broader "utvikler"
  console.log("No result for seniorutvikler, trying utvikler...");
  const fallback = await api("GET", "employee/employment/occupationCode?nameNO=utvikler&count=1&fields=id");
  if (Array.isArray(fallback) && fallback.length > 0) {
    occId = fallback[0].id;
  }
}
console.log("Division:", divisionId, "Dept:", deptId, "OccCode:", occId);

// Step 2: Create employee
const employeePayload: any = {
  firstName: "Raphaël",
  lastName: "Moreau",
  dateOfBirth: "1997-01-31",
  userType: "NO_ACCESS",
  department: { id: deptId },
  employments: [
    {
      startDate: "2026-06-02",
      ...(divisionId ? { division: { id: divisionId } } : {}),
      employmentDetails: [
        {
          date: "2026-06-02",
          employmentType: "ORDINARY",
          employmentForm: "PERMANENT",
          remunerationType: "MONTHLY_WAGE",
          workingHoursScheme: "NOT_SHIFT",
          percentageOfFullTimeEquivalent: 100,
          annualSalary: 790000,
          ...(occId ? { occupationCode: { id: occId } } : {}),
        },
      ],
    },
  ],
};

const employee = await api("POST", "employee", employeePayload);
const employeeId = employee.id;
console.log("Employee created:", employeeId);

// Step 3: Standard worktime
await api("POST", "employee/standardTime", {
  employee: { id: employeeId },
  fromDate: "2026-06-02",
  hoursPerDay: 7.5,
});

console.log("Done. Employee onboarded successfully.");
