const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "p9aMJaiXMUpF5ZExgu0Iw2og1Dz-KxUXD9FS88PWVYY";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: AUTH,
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) {
    console.error(text);
    throw new Error(`${res.status}`);
  }
  if (!text) return null;
  const json = JSON.parse(text);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function main() {
  // Step 1: Resolve prerequisites in parallel
  const [divisions, dept, occCodes] = await Promise.all([
    api("GET", "/division?count=1&fields=id"),
    api("POST", "/department", { name: "Drift" }),
    api("GET", `/employee/employment/occupationCode?nameNO=${encodeURIComponent("innkjøper")}&count=1&fields=id`),
  ]);

  const divisionId =
    Array.isArray(divisions) && divisions.length > 0
      ? divisions[0].id
      : null;
  const deptId = dept.id;
  const occId =
    Array.isArray(occCodes) && occCodes.length > 0 ? occCodes[0].id : null;

  console.log(`Division: ${divisionId}, Dept: ${deptId}, OccCode: ${occId}`);

  if (!occId) {
    throw new Error("Occupation code not found for STYRK 3323 (innkjøper)");
  }

  // Step 2: Create employee with all contract details
  const employment: any = {
    startDate: "2026-07-18",
    employmentDetails: [
      {
        date: "2026-07-18",
        employmentType: "ORDINARY",
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 100,
        annualSalary: 970000,
        occupationCode: { id: occId },
      },
    ],
  };

  if (divisionId) employment.division = { id: divisionId };

  const employee = await api("POST", "/employee", {
    firstName: "Lars",
    lastName: "Larsen",
    dateOfBirth: "1994-11-13",
    nationalIdentityNumber: "13119462627",
    email: "lars.larsen@example.org",
    bankAccountNumber: "10371694965",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [employment],
  });

  console.log("Created employee:", JSON.stringify(employee, null, 2));
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
