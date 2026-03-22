const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "vcDOcwCEI9mmNxB8DY7Ffn3Xqs2Ll3TJKV4jQULIvDs";
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
  if (!r.ok) { console.log("ERROR:", JSON.stringify(json).slice(0, 500)); throw new Error(`${r.status}`); }
  return json;
}

async function main() {
  // Step 1: parallel — GET division, POST department, GET salary/settings
  const [divRes, deptRes, salaryRes] = await Promise.all([
    api("GET", "/division?count=1&fields=id"),
    api("POST", "/department", { name: "Utvikling" }),
    api("GET", "/salary/settings?fields=municipality"),
  ]);

  const divId = divRes.count > 0 ? divRes.values[0].id : null;
  const deptId = deptRes.value.id;
  const municipalityId = salaryRes.value?.municipality?.id ?? null;

  console.log("divId:", divId, "deptId:", deptId, "municipalityId:", municipalityId);

  // STYRK 3512 → id 752 (BRUKERSTØTTE IKT) from hardcoded table
  const occCodeId = 752;

  // Step 2: POST /employee
  const employmentDetails: any = {
    date: "2026-07-25",
    employmentType: "ORDINARY",
    employmentForm: "PERMANENT",
    remunerationType: "MONTHLY_WAGE",
    workingHoursScheme: "NOT_SHIFT",
    percentageOfFullTimeEquivalent: 80,
    annualSalary: 480000,
    occupationCode: { id: occCodeId },
  };

  if (municipalityId) {
    employmentDetails.payrollTaxMunicipalityId = { id: municipalityId };
  }

  const employment: any = {
    startDate: "2026-07-25",
    employmentDetails: [employmentDetails],
  };

  if (divId) {
    employment.division = { id: divId };
  }

  const empPayload = {
    firstName: "Marit",
    lastName: "Lunde",
    dateOfBirth: "1982-09-19",
    userType: "NO_ACCESS",
    nationalIdentityNumber: "19098246226",
    bankAccountNumber: "58953347618",
    department: { id: deptId },
    employments: [employment],
  };

  const empRes = await api("POST", "/employee", empPayload);
  const empId = empRes.value.id;
  console.log("empId:", empId);

  // Step 3: POST /employee/standardTime (default 7.5 hours)
  await api("POST", "/employee/standardTime", {
    employee: { id: empId },
    fromDate: "2026-07-25",
    hoursPerDay: 7.5,
  });

  console.log("DONE — 4 API calls (3 parallel + POST employee + POST standardTime = 5 total)");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
