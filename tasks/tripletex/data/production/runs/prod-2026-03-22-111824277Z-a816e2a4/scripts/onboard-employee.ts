const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "WqmOuPBGRMZkFfMgaJBHxM0lYEBFntTVN9IWf8WTDBI";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  console.log(JSON.stringify(json, null, 2));
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  // Step 1: parallel GETs
  const [divRes, deptRes, salaryRes] = await Promise.all([
    api("GET", "/division?count=1&fields=id"),
    api("GET", "/department?name=Kundeservice&isInactive=false&count=1000&fields=*"),
    api("GET", "/salary/settings?fields=municipality"),
  ]);

  // Division
  const divisionId = divRes.count > 0 ? divRes.values[0].id : null;
  console.log("Division id:", divisionId);

  // Department - search first, create only if not found
  let deptId: number;
  const deptMatch = (deptRes.values || []).find(
    (d: any) => d.name.toLowerCase() === "kundeservice"
  );
  if (deptMatch) {
    // If multiple, pick highest id
    const allMatches = (deptRes.values || []).filter(
      (d: any) => d.name.toLowerCase() === "kundeservice"
    );
    deptId = allMatches.reduce((best: any, d: any) => d.id > best.id ? d : best).id;
    console.log("Reusing existing department:", deptId);
  } else {
    console.log("No matching department found, creating...");
    const deptCreate = await api("POST", "/department", { name: "Kundeservice" });
    deptId = deptCreate.value.id;
    console.log("Created department:", deptId);
  }

  // Municipality
  const municipalityId = salaryRes?.value?.municipality?.id || null;
  console.log("Municipality id:", municipalityId);

  // Step 3: POST /employee
  const employeePayload: any = {
    firstName: "Isabel",
    lastName: "García",
    dateOfBirth: "1980-02-14",
    nationalIdentityNumber: "14028013567",
    bankAccountNumber: "97208097079",
    email: "isabel.garcia@example.org",
    userType: "NO_ACCESS",
    employeeNumber: "1",
    department: { id: deptId },
    employments: [
      {
        startDate: "2026-07-13",
        employmentId: "1",
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
            occupationCode: { id: 4677 },
            ...(municipalityId ? { payrollTaxMunicipalityId: { id: municipalityId } } : {}),
          },
        ],
      },
    ],
  };

  const empRes = await api("POST", "/employee?fields=*,employments(*)", employeePayload);
  const empId = empRes.value.id;
  const employmentId = empRes.value.employments[0].id;
  console.log("Employee id:", empId, "Employment id:", employmentId);

  // Step 4: POST /employee/standardTime
  await api("POST", "/employee/standardTime", {
    employee: { id: empId },
    fromDate: "2026-07-13",
    hoursPerDay: 7.5,
  });

  // Step 5: parallel verification GETs
  const [empReadback, stdTime, empDetails] = await Promise.all([
    api("GET", `/employee/${empId}?fields=*,department(*),employments(*)`),
    api("GET", `/employee/standardTime?employeeId=${empId}&fields=*`),
    api("GET", `/employee/employment/details?employmentId=${employmentId}&fields=*`),
  ]);

  // Verification checks
  const e = empReadback.value;
  const checks = [
    ["firstName", e.firstName, "Isabel"],
    ["lastName", e.lastName, "García"],
    ["dateOfBirth", e.dateOfBirth, "1980-02-14"],
    ["email", e.email, "isabel.garcia@example.org"],
    ["nationalIdentityNumber", e.nationalIdentityNumber, "14028013567"],
    ["bankAccountNumber", e.bankAccountNumber, "97208097079"],
    ["department.name", e.department?.name, "Kundeservice"],
    ["employeeNumber", e.employeeNumber, "1"],
    ["startDate", e.employments?.[0]?.startDate, "2026-07-13"],
    ["employmentId", e.employments?.[0]?.employmentId, "1"],
  ];

  const d = empDetails.value;
  const detailChecks = [
    ["employmentType", d?.employmentType, "ORDINARY"],
    ["employmentForm", d?.employmentForm, "PERMANENT"],
    ["remunerationType", d?.remunerationType, "MONTHLY_WAGE"],
    ["workingHoursScheme", d?.workingHoursScheme, "NOT_SHIFT"],
    ["annualSalary", d?.annualSalary, 640000],
    ["percentageOfFullTimeEquivalent", d?.percentageOfFullTimeEquivalent, 80],
    ["occupationCode.id", d?.occupationCode?.id, 4677],
    ["payrollTaxMunicipalityId.id", d?.payrollTaxMunicipalityId?.id, municipalityId],
  ];

  const st = stdTime.values?.[0];
  const stdChecks = [
    ["hoursPerDay", st?.hoursPerDay, 7.5],
  ];

  for (const [field, actual, expected] of [...checks, ...detailChecks, ...stdChecks]) {
    if (String(actual) !== String(expected)) {
      console.log(`WARNING: ${field} = ${actual}, expected ${expected}`);
    } else {
      console.log(`OK: ${field} = ${actual}`);
    }
  }

  console.log("\nDone. Employee created and verified.");
}

main().catch((e) => { console.error(e); process.exit(1); });
