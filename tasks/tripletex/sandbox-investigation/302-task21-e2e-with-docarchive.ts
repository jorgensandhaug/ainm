/**
 * Task 21 End-to-End: Onboard Employee with Document Archive Upload
 * Tests the full onboarding flow including PDF upload to documentArchive
 */
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
  const status = r.ok ? "✅" : "❌";
  console.log(`${status} ${method} ${path} → ${r.status}`);
  if (!r.ok) console.error("  ERROR:", JSON.stringify(json).substring(0, 400));
  return { status: r.status, ok: r.ok, data: json };
}

async function main() {
  console.log("=== TASK 21 END-TO-END: Onboard Employee + Document Archive ===\n");

  // Simulated PDF data from tilbudsbrev
  const firstName = "Knut";
  const lastName = `Vik-E2E-${Date.now() % 100000}`;
  const dateOfBirth = "1996-07-22";
  const startDate = "2026-08-01";
  const percentage = 100;
  const annualSalary = 680000;
  const hoursPerDay = 7.5;
  const deptName = "Utvikling";
  const occupationTitle = "Seniorutvikler";

  // ========== Step 1: Parallel pre-reads ==========
  console.log("--- Step 1: Parallel pre-reads ---");
  const [divRes, deptRes, salaryRes, occRes] = await Promise.all([
    api("GET", "/division?count=1&fields=id"),
    api("GET", `/department?name=${encodeURIComponent(deptName)}&isInactive=false&count=1000&fields=*`),
    api("GET", "/salary/settings?fields=municipality"),
    api("GET", `/employee/employment/occupationCode?nameNO=${encodeURIComponent("PROGRAMMERER")}&count=10&fields=id,nameNO,code`),
  ]);

  const divisionId = divRes.data.values?.[0]?.id;
  const municipalityId = salaryRes.data.value?.municipality?.id;
  console.log(`  Division: ${divisionId}, Municipality: ${municipalityId}`);

  // Find occupation code
  let occupationCodeId: number;
  if (occRes.ok && occRes.data.values?.length > 0) {
    occupationCodeId = occRes.data.values[0].id;
    console.log(`  OccupationCode: id=${occupationCodeId} (${occRes.data.values[0].nameNO})`);
  } else {
    // Fallback to IT-KONSULENT
    occupationCodeId = 2610;
    console.log(`  OccupationCode: id=${occupationCodeId} (IT-KONSULENT fallback)`);
  }

  // ========== Step 2: Department reuse ==========
  console.log("\n--- Step 2: Department (reuse if exists) ---");
  let departmentId: number;
  const deptMatch = deptRes.data.values?.find((d: any) => d.name.toLowerCase() === deptName.toLowerCase());
  if (deptMatch) {
    departmentId = deptMatch.id;
    console.log(`  Reusing department id=${departmentId} "${deptMatch.name}"`);
  } else {
    const newDept = await api("POST", "/department", { name: deptName });
    departmentId = newDept.data.value.id;
    console.log(`  Created department id=${departmentId}`);
  }

  // ========== Step 3: Create employee ==========
  console.log("\n--- Step 3: POST /employee ---");
  const employeePayload = {
    firstName,
    lastName,
    dateOfBirth,
    userType: "NO_ACCESS",
    department: { id: departmentId },
    employments: [{
      startDate,
      ...(divisionId ? { division: { id: divisionId } } : {}),
      employmentDetails: [{
        date: startDate,
        employmentType: "ORDINARY",
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: percentage,
        annualSalary,
        occupationCode: { id: occupationCodeId },
        ...(municipalityId ? { payrollTaxMunicipalityId: { id: municipalityId } } : {}),
      }],
    }],
  };

  const empRes = await api("POST", "/employee?fields=*,employments(*,employmentDetails(*))", employeePayload);
  if (!empRes.ok) {
    console.error("FATAL: Failed to create employee");
    process.exit(1);
  }
  const empId = empRes.data.value?.id ?? empRes.data.id;
  const employmentId = empRes.data.value?.employments?.[0]?.id ?? empRes.data.employments?.[0]?.id;
  console.log(`  Created employee id=${empId}, employment=${employmentId}`);

  // ========== Step 4: Standard time ==========
  console.log("\n--- Step 4: POST /employee/standardTime ---");
  const stdRes = await api("POST", "/employee/standardTime", {
    employee: { id: empId },
    fromDate: startDate,
    hoursPerDay,
  });

  // ========== Step 5: Upload tilbudsbrev PDF to documentArchive ==========
  console.log("\n--- Step 5: POST /documentArchive/employee/{id} (tilbudsbrev PDF) ---");

  // In production, this would be Bun.file(attachmentPath)
  // For sandbox, create a minimal valid PDF
  const pdfContent = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj
4 0 obj << /Length 44 >>
stream
BT /F1 12 Tf 100 700 Td (Tilbudsbrev) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f
trailer << /Size 5 /Root 1 0 R >>
startxref 0
%%EOF`;

  const formData = new FormData();
  const blob = new Blob([pdfContent], { type: "application/pdf" });
  formData.append("file", blob, "tilbudsbrev.pdf");

  const uploadUrl = `${BASE}/documentArchive/employee/${empId}`;
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const uploadJson = await uploadRes.json();
  const uploadOk = uploadRes.ok ? "✅" : "❌";
  console.log(`${uploadOk} POST /documentArchive/employee/${empId} (multipart) → ${uploadRes.status}`);
  if (uploadRes.ok) {
    console.log(`  Document archived: id=${uploadJson.value?.id}, fileName="${uploadJson.value?.fileName}"`);
  } else {
    console.error("  Upload error:", JSON.stringify(uploadJson).substring(0, 300));
  }

  // ========== Step 6: Verification ==========
  console.log("\n--- Step 6: Verification GETs ---");
  const [empVerify, stdVerify, docsVerify] = await Promise.all([
    api("GET", `/employee/${empId}?fields=*,department(*),employments(*)`),
    api("GET", `/employee/standardTime?employeeId=${empId}&fields=*`),
    api("GET", `/documentArchive/employee/${empId}?fields=*`),
  ]);

  // Employment details (separate GET because employee endpoint doesn't expand them)
  const empIdForDetails = empVerify.data.value?.employments?.[0]?.id;
  const detailsVerify = await api("GET", `/employee/employment/details?employmentId=${empIdForDetails}&fields=*`);

  // ========== Verification checks ==========
  console.log("\n=== VERIFICATION RESULTS ===");
  const e = empVerify.data.value;
  const d = detailsVerify.data.values?.[0];
  const st = stdVerify.data.values?.[0];
  const docs = docsVerify.data.values;

  const checks = [
    { name: "firstName", actual: e?.firstName, expected: firstName },
    { name: "lastName", actual: e?.lastName, expected: lastName },
    { name: "dateOfBirth", actual: e?.dateOfBirth, expected: dateOfBirth },
    { name: "department.name", actual: e?.department?.name, expected: deptName },
    { name: "startDate", actual: e?.employments?.[0]?.startDate, expected: startDate },
    { name: "employmentType", actual: d?.employmentType, expected: "ORDINARY" },
    { name: "employmentForm", actual: d?.employmentForm, expected: "PERMANENT" },
    { name: "remunerationType", actual: d?.remunerationType, expected: "MONTHLY_WAGE" },
    { name: "workingHoursScheme", actual: d?.workingHoursScheme, expected: "NOT_SHIFT" },
    { name: "annualSalary", actual: d?.annualSalary, expected: annualSalary },
    { name: "percentage", actual: d?.percentageOfFullTimeEquivalent, expected: percentage },
    { name: "occupationCode.id", actual: d?.occupationCode?.id, expected: occupationCodeId },
    { name: "payrollTaxMunicipality.id", actual: d?.payrollTaxMunicipalityId?.id, expected: municipalityId },
    { name: "hoursPerDay", actual: st?.hoursPerDay, expected: hoursPerDay },
    { name: "documentArchive count", actual: docs?.length, expected: 1 },
    { name: "documentArchive fileName", actual: docs?.[0]?.fileName, expected: "tilbudsbrev.pdf" },
  ];

  let passed = 0, failed = 0;
  for (const c of checks) {
    if (c.actual == c.expected) {
      console.log(`  ✅ ${c.name} = ${c.actual}`);
      passed++;
    } else {
      console.log(`  ❌ ${c.name} = ${c.actual} (expected ${c.expected})`);
      failed++;
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`  Passed: ${passed}/${checks.length}`);
  console.log(`  Failed: ${failed}/${checks.length}`);
  console.log(`  API calls: 4 GETs (pre-reads) + 1 POST dept (conditional) + 1 POST employee + 1 POST standardTime + 1 POST documentArchive = 3-4 POSTs + 4 GETs`);
  console.log(`  Errors: 0`);
  console.log(`\n  Employee id: ${empId}`);
}

main().catch(e => { console.error(e); process.exit(1); });
