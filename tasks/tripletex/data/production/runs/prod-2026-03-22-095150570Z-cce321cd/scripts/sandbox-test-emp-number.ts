// Test: can we set employeeNumber and employmentId on POST /employee?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
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
  console.log(`\n${method} ${path} → ${r.status}`);
  if (!r.ok) console.error(JSON.stringify(json, null, 2));
  return { status: r.status, ok: r.ok, json };
}

async function main() {
  // Pre-reads
  const [divRes, salaryRes] = await Promise.all([
    api("GET", "/division?count=1&fields=id"),
    api("GET", "/salary/settings?fields=municipality"),
  ]);
  const divisionId = divRes.json.values?.length > 0 ? divRes.json.values[0].id : null;
  const municipalityId = salaryRes.json.value?.municipality?.id ?? null;

  // Get existing department
  const deptRes = await api("GET", "/department?name=SandboxTestVerify&isInactive=false&count=10&fields=*");
  const deptId = deptRes.json.values?.[0]?.id;
  console.log(`Using dept ${deptId}, div ${divisionId}, municipality ${municipalityId}`);

  // Test 1: Create employee WITH employeeNumber
  const empPayload: any = {
    firstName: "EmpNumTest",
    lastName: "Hypothesis",
    dateOfBirth: "1988-05-20",
    userType: "NO_ACCESS",
    employeeNumber: "999",
    department: { id: deptId },
    employments: [
      {
        startDate: "2026-07-01",
        employmentId: "999",
        ...(divisionId ? { division: { id: divisionId } } : {}),
        employmentDetails: [
          {
            date: "2026-07-01",
            employmentType: "ORDINARY",
            employmentForm: "PERMANENT",
            remunerationType: "MONTHLY_WAGE",
            workingHoursScheme: "NOT_SHIFT",
            percentageOfFullTimeEquivalent: 100,
            annualSalary: 600000,
            occupationCode: { id: 2610 },
            ...(municipalityId ? { payrollTaxMunicipalityId: { id: municipalityId } } : {}),
          },
        ],
      },
    ],
  };

  const empRes = await api("POST", "/employee", empPayload);
  if (empRes.ok) {
    const emp = empRes.json.value;
    console.log(`\n=== Employee created ===`);
    console.log(`employeeNumber: "${emp.employeeNumber}"`);
    console.log(`employments[0].employmentId: check via GET...`);

    // Verify via GET
    const verifyRes = await api("GET", `/employee/${emp.id}?fields=*,employments(*)`);
    const v = verifyRes.json.value;
    console.log(`\n=== Readback ===`);
    console.log(`employeeNumber: "${v.employeeNumber}"`);
    if (v.employments?.[0]) {
      console.log(`employmentId: "${v.employments[0].employmentId}"`);
    }

    // Check employment details
    const detRes = await api("GET", `/employee/employment/details?employmentId=${v.employments[0].id}&fields=*`);
    console.log(`\nEmployment details:`, JSON.stringify(detRes.json?.values?.[0], null, 2));
  }

  // Test 2: For comparison, check a fresh account would start with "1"
  // Try creating with employeeNumber "1"
  const empPayload2: any = {
    ...empPayload,
    firstName: "EmpNumOne",
    employeeNumber: "1",
    employments: [{
      ...empPayload.employments[0],
      employmentId: "1",
    }],
  };
  const empRes2 = await api("POST", "/employee", empPayload2);
  if (empRes2.ok) {
    const emp2 = empRes2.json.value;
    console.log(`\n=== Employee 2 (number="1") ===`);
    console.log(`employeeNumber: "${emp2.employeeNumber}"`);
    const verify2 = await api("GET", `/employee/${emp2.id}?fields=*,employments(*)`);
    console.log(`employeeNumber readback: "${verify2.json.value.employeeNumber}"`);
    console.log(`employmentId readback: "${verify2.json.value.employments?.[0]?.employmentId}"`);
  } else {
    console.log(`\nEmployee 2 creation failed — employeeNumber "1" may already exist`);
  }

  console.log("\n=== Test complete ===");
}

main().catch(e => { console.error(e); process.exit(1); });
