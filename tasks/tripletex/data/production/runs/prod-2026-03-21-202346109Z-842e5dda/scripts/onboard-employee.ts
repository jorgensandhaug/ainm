const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "mGsZC6Var68pq45qt-c2-UKVT2Q5uHpLgv86IqaWTzo";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} /${path} → ${r.status}`);
  if (!r.ok) {
    console.log("ERROR:", JSON.stringify(json, null, 2));
    throw new Error(`${r.status} on ${method} /${path}`);
  }
  return json;
}

async function main() {
  // Step 1: parallel - GET division, POST department, GET occupationCode for STYRK 3313
  const [divRes, deptRes, occRes] = await Promise.all([
    api("GET", "division?count=1&fields=id"),
    api("POST", "department", { name: "Innkjøp" }),
    api("GET", "employee/employment/occupationCode?nameNO=regnskapsfører&count=10&fields=id,nameNO"),
  ]);

  // Division
  const divisionId = divRes.values?.length > 0 ? divRes.values[0].id : null;
  console.log("Division ID:", divisionId);

  // Department
  const departmentId = deptRes.value.id;
  console.log("Department ID:", departmentId);

  // Occupation code - find exact match for REGNSKAPSFØRER
  const occValues = occRes.values || [];
  console.log("Occupation code results:", JSON.stringify(occValues));
  let occupationCodeId: number | null = null;
  for (const oc of occValues) {
    if (oc.nameNO?.toUpperCase() === "REGNSKAPSFØRER") {
      occupationCodeId = oc.id;
      break;
    }
  }
  // Fallback to first result if no exact match
  if (!occupationCodeId && occValues.length > 0) {
    occupationCodeId = occValues[0].id;
    console.log("Using fallback occupation code:", occupationCodeId);
  }
  console.log("Occupation code ID:", occupationCodeId);

  // Step 2: POST employee
  const employeePayload: any = {
    firstName: "Miguel",
    lastName: "Costa",
    dateOfBirth: "1981-11-06",
    nationalIdentityNumber: "06118185755",
    email: "miguel.costa@example.org",
    bankAccountNumber: "63096583860",
    userType: "NO_ACCESS",
    department: { id: departmentId },
    employments: [
      {
        startDate: "2026-11-24",
        ...(divisionId ? { division: { id: divisionId } } : {}),
        employmentDetails: [
          {
            date: "2026-11-24",
            employmentType: "ORDINARY",
            employmentForm: "PERMANENT",
            remunerationType: "MONTHLY_WAGE",
            workingHoursScheme: "NOT_SHIFT",
            percentageOfFullTimeEquivalent: 100,
            annualSalary: 790000,
            ...(occupationCodeId ? { occupationCode: { id: occupationCodeId } } : {}),
          },
        ],
      },
    ],
  };

  const empRes = await api("POST", "employee", employeePayload);
  console.log("Employee created:", JSON.stringify(empRes.value, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
