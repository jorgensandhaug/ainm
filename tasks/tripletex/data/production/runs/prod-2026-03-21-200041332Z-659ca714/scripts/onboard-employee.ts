const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "XwzwbgHYNdrXRx2QKAI3mKsk9qyKmjy9JWOVUFvwHyc";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: h };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) {
    console.error("ERROR:", text);
    throw new Error(`${r.status}: ${text}`);
  }
  if (!text) return null;
  const json = JSON.parse(text);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function main() {
  // Step 1: parallel prerequisite calls
  const [divResult, deptResult, occResult] = await Promise.all([
    api("GET", "/division?count=1&fields=id"),
    api("POST", "/department", { name: "HR" }),
    api("GET", "/employee/employment/occupationCode?nameNO=personalrådgiver&count=10&fields=id,nameNO"),
  ]);

  // Division
  const divisionId = Array.isArray(divResult) && divResult.length > 0 ? divResult[0].id : null;
  console.log("Division ID:", divisionId);

  // Department
  const deptId = deptResult.id;
  console.log("Department ID:", deptId);

  // Occupation code - find exact match for PERSONALRÅDGIVER
  let occId: number | null = null;
  if (Array.isArray(occResult) && occResult.length > 0) {
    // Look for exact match first (case-insensitive)
    const exact = occResult.find((o: any) => o.nameNO?.toUpperCase() === "PERSONALRÅDGIVER");
    if (exact) {
      occId = exact.id;
      console.log("Occupation code (exact match):", occId, exact.nameNO);
    } else {
      // Use first result as best-effort fallback
      occId = occResult[0].id;
      console.log("Occupation code (fallback):", occId, occResult[0].nameNO);
    }
  } else {
    console.log("No occupation code results for 'personalrådgiver'");
  }
  console.log("Occupation results:", JSON.stringify(occResult));

  // Step 2: POST /employee
  const employeePayload: any = {
    firstName: "Randi",
    lastName: "Stølsvik",
    dateOfBirth: "1992-05-11",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [
      {
        startDate: "2026-10-21",
        ...(divisionId ? { division: { id: divisionId } } : {}),
        employmentDetails: [
          {
            date: "2026-10-21",
            employmentType: "ORDINARY",
            employmentForm: "PERMANENT",
            remunerationType: "MONTHLY_WAGE",
            workingHoursScheme: "NOT_SHIFT",
            percentageOfFullTimeEquivalent: 100,
            annualSalary: 650000,
            ...(occId ? { occupationCode: { id: occId } } : {}),
          },
        ],
      },
    ],
  };

  const empResult = await api("POST", "/employee", employeePayload);
  const employeeId = empResult.id;
  console.log("Employee ID:", employeeId);

  // Step 3: POST /employee/standardTime
  const stdTimeResult = await api("POST", "/employee/standardTime", {
    employee: { id: employeeId },
    fromDate: "2026-10-21",
    hoursPerDay: 7.5,
  });
  console.log("Standard time created:", JSON.stringify(stdTimeResult));

  console.log("\nDone. 5 API calls total.");
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
