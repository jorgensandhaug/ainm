const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "vBOSGhh3Ma7ZMsnDGyDySF1KvhKC8wf5PtcjhxwcMiw";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
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
  // Step 1: parallel — division, department, occupation code lookup
  const [divRes, deptRes, occRes] = await Promise.all([
    api("GET", "/division?count=1&fields=id"),
    api("POST", "/department", { name: "Produksjon" }),
    api("GET", "/employee/employment/occupationCode?nameNO=Markedsanalytiker&count=10&fields=id,nameNO"),
  ]);

  // Division
  const divId = divRes?.values?.[0]?.id;
  console.log("Division id:", divId ?? "none (omitting)");

  // Department
  const deptId = deptRes?.value?.id;
  console.log("Department id:", deptId);

  // Occupation code — find exact match
  const occCodes = occRes?.values ?? [];
  console.log("Occupation codes returned:", JSON.stringify(occCodes));
  const exactMatch = occCodes.find(
    (c: any) => c.nameNO?.toUpperCase() === "MARKEDSANALYTIKER"
  );
  if (!exactMatch) {
    console.error("No exact occupation code match found! Results:", occCodes);
    throw new Error("Occupation code lookup failed");
  }
  console.log("Occupation code match:", exactMatch.id, exactMatch.nameNO);

  // Step 2: Create employee
  const employeePayload: any = {
    firstName: "Carmen",
    lastName: "Pérez",
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
            occupationCode: { id: exactMatch.id },
          },
        ],
      },
    ],
  };

  const empRes = await api("POST", "/employee", employeePayload);
  const empId = empRes?.value?.id;
  console.log("Employee id:", empId);

  // Step 3: Standard worktime
  const stdTimeRes = await api("POST", "/employee/standardTime", {
    employee: { id: empId },
    fromDate: "2026-12-02",
    hoursPerDay: 6.0,
  });
  console.log("Standard time set:", JSON.stringify(stdTimeRes?.value));

  console.log("\nDone. Total: 5 API calls, 0 errors expected.");
}

main().catch((e) => { console.error(e); process.exit(1); });
