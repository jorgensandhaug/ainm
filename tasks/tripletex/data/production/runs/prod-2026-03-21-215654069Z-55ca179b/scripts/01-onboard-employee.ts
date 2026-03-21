const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "Ve172prjO-UwMzhzZrPNUSMbnWvnTWSanNzpT-3GQF8";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) {
    console.error("ERROR:", JSON.stringify(json, null, 2));
    throw new Error(`${method} ${path} failed: ${r.status}`);
  }
  return json;
}

async function main() {
  // Step 1: parallel prerequisites
  const [divRes, deptRes, occRes] = await Promise.all([
    api("GET", "/division?count=1&fields=id"),
    api("POST", "/department", { name: "IT" }),
    api("GET", "/employee/employment/occupationCode?nameNO=IT-konsulent&count=10&fields=id,nameNO"),
  ]);

  // Parse division
  const divRows = divRes?.values ?? [];
  const divisionId = divRows.length > 0 ? divRows[0].id : null;
  console.log("Division ID:", divisionId);

  // Parse department
  const deptId = deptRes?.value?.id;
  console.log("Department ID:", deptId);

  // Parse occupation code - find exact match for "IT-KONSULENT"
  const occRows = occRes?.values ?? [];
  console.log("Occupation code results:", JSON.stringify(occRows));
  let occId: number | null = null;
  for (const row of occRows) {
    if (row.nameNO?.toUpperCase() === "IT-KONSULENT") {
      occId = row.id;
      break;
    }
  }
  // If no exact match, try first result as fallback
  if (!occId && occRows.length > 0) {
    console.log("No exact match for IT-KONSULENT, using first result as fallback:", occRows[0].nameNO);
    occId = occRows[0].id;
  }
  if (!occId) {
    // If "IT-konsulent" returned 0 results, try "konsulent" as a broader search
    console.log("IT-konsulent returned 0 results, trying broader search...");
    const occRes2 = await api("GET", "/employee/employment/occupationCode?nameNO=IT-konsulent&count=10&fields=id,nameNO");
    // This shouldn't happen since we already tried - let me try just "konsulent"
    // Actually, re-think: if 0 results, we need a different nameNO
    const occRes3 = await api("GET", "/employee/employment/occupationCode?nameNO=konsulent&count=10&fields=id,nameNO");
    const occRows3 = occRes3?.values ?? [];
    console.log("Konsulent results:", JSON.stringify(occRows3));
    // Look for IT-KONSULENT or KONSULENT
    for (const row of occRows3) {
      if (row.nameNO?.toUpperCase() === "IT-KONSULENT") {
        occId = row.id;
        break;
      }
    }
    if (!occId) {
      for (const row of occRows3) {
        if (row.nameNO?.toUpperCase() === "KONSULENT") {
          occId = row.id;
          break;
        }
      }
    }
    if (!occId && occRows3.length > 0) {
      console.log("No exact match, using first konsulent result:", occRows3[0].nameNO);
      occId = occRows3[0].id;
    }
  }
  console.log("Occupation code ID:", occId);

  // Step 2: POST /employee
  const employeePayload: any = {
    firstName: "Kristian",
    lastName: "Ødegård",
    dateOfBirth: "1987-12-30",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [
      {
        startDate: "2026-05-24",
        ...(divisionId ? { division: { id: divisionId } } : {}),
        employmentDetails: [
          {
            date: "2026-05-24",
            employmentType: "ORDINARY",
            employmentForm: "PERMANENT",
            remunerationType: "MONTHLY_WAGE",
            workingHoursScheme: "NOT_SHIFT",
            percentageOfFullTimeEquivalent: 100,
            annualSalary: 560000,
            ...(occId ? { occupationCode: { id: occId } } : {}),
          },
        ],
      },
    ],
  };

  const empRes = await api("POST", "/employee", employeePayload);
  const employeeId = empRes?.value?.id;
  console.log("Employee ID:", employeeId);

  // Step 3: POST /employee/standardTime
  const stRes = await api("POST", "/employee/standardTime", {
    employee: { id: employeeId },
    fromDate: "2026-05-24",
    hoursPerDay: 7.5,
  });
  console.log("Standard time created:", JSON.stringify(stRes?.value?.id));
}

main().catch((e) => { console.error(e); process.exit(1); });
