const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "m5IPA2qvJhKzTlxdbbXJlYDKAJtZUPIGlM5pwfcG4zE";
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
  if (!r.ok) { console.error("ERROR:", JSON.stringify(json, null, 2)); throw new Error(`${r.status}`); }
  return json;
}

async function main() {
  // PDF data
  const firstName = "Kristian";
  const lastName = "Ødegård";
  const dateOfBirth = "1987-12-30";
  const startDate = "2026-05-24";
  const percentage = 100;
  const annualSalary = 560000;
  const hoursPerDay = 7.5;
  const deptName = "IT";
  const occupationCodeId = 2610; // IT-konsulent from hardcoded table

  // Step 1: parallel GETs
  const [divRes, deptRes, salaryRes] = await Promise.all([
    api("GET", "/division?count=1&fields=id"),
    api("GET", `/department?name=${encodeURIComponent(deptName)}&isInactive=false&count=1000&fields=*`),
    api("GET", "/salary/settings?fields=municipality"),
  ]);

  // Division
  const divisionId = divRes.values?.length > 0 ? divRes.values[0].id : null;

  // Department: reuse if exact match exists, else create
  let departmentId: number | null = null;
  if (deptRes.values?.length > 0) {
    const matches = deptRes.values.filter((d: any) => d.name.toLowerCase() === deptName.toLowerCase());
    if (matches.length > 0) {
      departmentId = matches.reduce((a: any, b: any) => a.id > b.id ? a : b).id;
      console.log(`Reusing department id=${departmentId}`);
    }
  }

  // Step 2: create department only if no match
  if (departmentId === null) {
    const deptCreate = await api("POST", "/department", { name: deptName });
    departmentId = deptCreate.value.id;
    console.log(`Created department id=${departmentId}`);
  }

  // Municipality for payrollTaxMunicipalityId
  const municipalityId = salaryRes.value?.municipality?.id ?? null;
  console.log(`Municipality id=${municipalityId}`);

  // Step 3: POST /employee
  const employeePayload: any = {
    firstName,
    lastName,
    dateOfBirth,
    userType: "NO_ACCESS",
    department: { id: departmentId },
    employments: [
      {
        startDate,
        ...(divisionId ? { division: { id: divisionId } } : {}),
        employmentDetails: [
          {
            date: startDate,
            employmentType: "ORDINARY",
            employmentForm: "PERMANENT",
            remunerationType: "MONTHLY_WAGE",
            workingHoursScheme: "NOT_SHIFT",
            percentageOfFullTimeEquivalent: percentage,
            annualSalary,
            occupationCode: { id: occupationCodeId },
            ...(municipalityId ? { payrollTaxMunicipalityId: { id: municipalityId } } : {}),
          },
        ],
      },
    ],
  };
  // No email in PDF — omit

  const empRes = await api("POST", "/employee", employeePayload);
  const empId = empRes.value.id;
  console.log(`Created employee id=${empId}`);

  // Step 4: POST /employee/standardTime
  const stdTimeRes = await api("POST", "/employee/standardTime", {
    employee: { id: empId },
    fromDate: startDate,
    hoursPerDay,
  });
  console.log(`StandardTime created`);

  // Step 5: parallel verification GETs
  const [empVerify, stdVerify] = await Promise.all([
    api("GET", `/employee/${empId}?fields=*,department(*),employments(*)`),
    api("GET", `/employee/standardTime?employeeId=${empId}&fields=*`),
  ]);

  // Step 6: GET employment details
  const employmentId = empVerify.value.employments?.[0]?.id;
  if (employmentId) {
    const detailsRes = await api("GET", `/employee/employment/details?employmentId=${employmentId}&fields=*`);
    const d = detailsRes.values?.[0];
    if (d) {
      const checks = [
        ["employmentType", d.employmentType, "ORDINARY"],
        ["employmentForm", d.employmentForm, "PERMANENT"],
        ["remunerationType", d.remunerationType, "MONTHLY_WAGE"],
        ["workingHoursScheme", d.workingHoursScheme, "NOT_SHIFT"],
        ["annualSalary", d.annualSalary, annualSalary],
        ["percentage", d.percentageOfFullTimeEquivalent, percentage],
        ["occupationCode.id", d.occupationCode?.id, occupationCodeId],
        ["payrollTaxMunicipalityId.id", d.payrollTaxMunicipalityId?.id, municipalityId],
      ];
      for (const [field, actual, expected] of checks) {
        if (actual != expected) console.log(`WARNING: ${field} = ${actual}, expected ${expected}`);
        else console.log(`OK: ${field} = ${actual}`);
      }
    }
  }

  // Verify employee fields
  const e = empVerify.value;
  const empChecks = [
    ["firstName", e.firstName, firstName],
    ["lastName", e.lastName, lastName],
    ["dateOfBirth", e.dateOfBirth, dateOfBirth],
    ["department.name", e.department?.name, deptName],
    ["startDate", e.employments?.[0]?.startDate, startDate],
  ];
  for (const [field, actual, expected] of empChecks) {
    if (actual != expected) console.log(`WARNING: ${field} = ${actual}, expected ${expected}`);
    else console.log(`OK: ${field} = ${actual}`);
  }

  // Verify standard time
  const st = stdVerify.values?.[0];
  if (st) {
    if (st.hoursPerDay != hoursPerDay) console.log(`WARNING: hoursPerDay = ${st.hoursPerDay}, expected ${hoursPerDay}`);
    else console.log(`OK: hoursPerDay = ${st.hoursPerDay}`);
  }

  console.log("\nDone. Employee onboarded successfully.");
}

main().catch(e => { console.error(e); process.exit(1); });
