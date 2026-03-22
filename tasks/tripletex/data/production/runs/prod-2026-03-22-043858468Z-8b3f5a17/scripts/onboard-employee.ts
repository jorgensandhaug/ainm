const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "b54rd-mSCwEIexkLzGsSccKbU2GYm3DDHpxGe15OypU";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) { console.log(text); throw new Error(`${res.status}`); }
  return JSON.parse(text);
}

async function main() {
  // Division already fetched (200), department already created (201) in prior run.
  // Need to: find dept id, find division id, find occupation code, create employee, create standardTime.

  // Step 1: GET existing department + division (parallel), plus occupation code search by name
  // STYRK 1211 = "Finans- og økonomisjef" → search nameNO=finanssjef
  const [divRes, deptRes, occRes] = await Promise.all([
    api("GET", "/division?count=1&fields=id"),
    api("GET", "/department?name=Kvalitetskontroll&count=1&fields=id"),
    api("GET", "/employee/employment/occupationCode?nameNO=finanssjef&count=10&fields=id,nameNO,code"),
  ]);

  const divisionId = divRes.count > 0 ? divRes.values[0].id : null;
  const departmentId = deptRes.values[0].id;

  // Find occupation code
  const occCodes = occRes.values || [];
  console.log("Occupation codes:", JSON.stringify(occCodes.map((o: any) => ({ id: o.id, code: o.code, nameNO: o.nameNO }))));

  // Look for code starting with "1211" or nameNO containing FINANSSJEF
  let occId: number | null = null;
  for (const o of occCodes) {
    if (String(o.code).startsWith("1211")) { occId = o.id; console.log(`Matched by code: ${o.code} ${o.nameNO}`); break; }
  }
  if (!occId) {
    // Fallback: take the one whose nameNO best matches
    const exact = occCodes.find((o: any) => o.nameNO === "FINANSSJEF");
    if (exact) occId = exact.id;
    else if (occCodes.length > 0) {
      // Take first that has FINANSSJEF in name
      const match = occCodes.find((o: any) => o.nameNO?.includes("FINANSSJEF"));
      if (match) occId = match.id;
    }
  }
  if (!occId) throw new Error("Could not find occupation code for STYRK 1211");
  console.log(`Using occupation code id: ${occId}`);

  // Step 2: POST /employee (arbeidskontrakt → ORDINARY / NOT_SHIFT)
  const empRes = await api("POST", "/employee", {
    firstName: "Maximilian",
    lastName: "Fischer",
    dateOfBirth: "1987-10-19",
    userType: "NO_ACCESS",
    nationalIdentityNumber: "19108715467",
    bankAccountNumber: "94000111575",
    email: "maximilian.fischer@example.org",
    department: { id: departmentId },
    employments: [
      {
        startDate: "2026-08-20",
        ...(divisionId ? { division: { id: divisionId } } : {}),
        employmentDetails: [
          {
            date: "2026-08-20",
            employmentType: "ORDINARY",
            employmentForm: "PERMANENT",
            remunerationType: "MONTHLY_WAGE",
            workingHoursScheme: "NOT_SHIFT",
            percentageOfFullTimeEquivalent: 100,
            annualSalary: 530000,
            occupationCode: { id: occId },
          },
        ],
      },
    ],
  });

  const empId = empRes.value.id;
  console.log(`Employee created: id=${empId}`);

  // Step 3: POST /employee/standardTime
  await api("POST", "/employee/standardTime", {
    employee: { id: empId },
    fromDate: "2026-08-20",
    hoursPerDay: 7.5,
  });

  console.log("Done!");
}

main().catch(e => { console.error(e); process.exit(1); });
