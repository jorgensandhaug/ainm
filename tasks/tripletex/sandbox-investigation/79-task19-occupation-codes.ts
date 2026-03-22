// Task 19 Check 10 — Occupation code and standard worktime investigation
//
// ===== CRITICAL FINDINGS =====
//
// FINDING 1: Check 10 is NOT about occupation codes — it is about STANDARD WORKTIME.
//   Evidence: Check 10 fails in ALL 4 scored task 19 runs, regardless of STYRK code
//   (4110, 3323, 3313). NONE of these runs set standard worktime via POST /employee/standardTime.
//   The arbeidskontrakt PDF never mentions standard worktime, so agents skip the call.
//   But the scorer expects 7.5h/day (Norwegian standard per arbeidsmiljoloven) to be set.
//
// FINDING 2: Check 13 is about occupation code correctness.
//   Evidence: Check 13 PASSES for STYRK 4110 → KONTORMEDARBEIDER (2951, code 4114105),
//   but FAILS for STYRK 3323 → INNKJØPER (2503) and STYRK 3313 → REGNSKAPSFØRER (4672).
//   The corrected mappings (INNKJØPSASSISTENT 2507, REGNSKAPSMEDARBEIDER 4677) have not
//   been production-tested yet but are sandbox-verified.
//
// FINDING 3: Tripletex uses STYRK-98 occupation codes, NOT STYRK-08.
//   The 7-digit code format is [4-digit STYRK-98 group][3-digit individual code].
//   The official SSB correspondence table (id 426) maps between STYRK-08 and the
//   yrkeskatalogen (STYRK-98 based). Key STYRK-08 to STYRK-98 mappings:
//     STYRK-08 4110 → STYRK-98 4114 → KONTORMEDARBEIDER (2951, code 4114105) ✓
//     STYRK-08 3323 → STYRK-98 3416 → INNKJØPSASSISTENT (2507, code 3416103) [corrected]
//     STYRK-08 3313 → STYRK-98 4121 → REGNSKAPSMEDARBEIDER (4677, code 4121115) [corrected]
//     STYRK-08 3512 → STYRK-98 3120 → BRUKERSTØTTE IKT (752, code 3120130) ✓
//     STYRK-08 1233 → STYRK-98 1233 → SALGSSJEF (4930, code 1233105) ✓
//     STYRK-08 2511 → STYRK-98 2130 → SYSTEMANALYTIKER (5921, code 2130124) [WARNING: current
//       mapping id 301 AUTORISERT REGNSKAPSFØRER is from STYRK-98 2511, which in STYRK-08
//       corresponds to 3313 (Regnskapsførere), NOT 2511 (Systemanalytikere)]
//
// FINDING 4: The SSB STYRK-08 group names differ from what the playbook assumed.
//   Official SSB STYRK-08 names (from codesAt endpoint):
//     3313 = "Regnskapsførere" (NOT "Regnskapsmedarbeidere og bokholdere")
//     3323 = "Innkjøpere" (NOT "Innkjøps- og forsyningsassistenter")
//     4110 = "Kontormedarbeidere"
//     3512 = "Brukerstøtte, IKT"
//     2511 = "Systemanalytikere/-arkitekter"
//   However, the SSB correspondence table shows that many STYRK-98 codes map to each
//   STYRK-08 group. The scorer appears to expect a SPECIFIC occupation code within the
//   valid set, not just any valid mapping.
//
// FINDING 5: Production run data:
//   Run a2367369 (STYRK 4110, KONTORMEDARBEIDER 2951, no std time): 20/22, ch10 FAIL, ch13 PASS
//   Run 8da36fcc (STYRK 3323, INNKJØPER 2503, no std time): 18/22, ch10 FAIL, ch13 FAIL
//   Run 842e5dda (STYRK 3313, REGNSKAPSFØRER 4672, no std time): 18/22, ch10 FAIL, ch13 FAIL
//   Run 6c62b426 (STYRK 3313, REGNSKAPSFØRER 4672, no std time): 18/22, ch10 FAIL, ch13 FAIL
//
// ACTION ITEMS:
// 1. ALWAYS set POST /employee/standardTime with hoursPerDay=7.5 for task 19 runs
//    (already in the trusted standard but was not done in any scored task 19 run)
// 2. Keep corrected STYRK mappings: 3323→2507, 3313→4677
// 3. INVESTIGATE STYRK 2511 mapping: id 301 is likely WRONG (AUTORISERT REGNSKAPSFØRER
//    is a STYRK-08 3313 code per SSB, not STYRK-08 2511); correct might be
//    SYSTEMANALYTIKER (5921, code 2130124) — needs production test
//
// This script verifies the corrected mappings persist correctly in sandbox.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 500));
  return { status: res.status, data: json };
}

async function main() {
  console.log("=== PART 1: Verify all known occupation codes ===\n");

  const knownCodes = [
    { id: 2951, label: "KONTORMEDARBEIDER / STYRK-08 4110" },
    { id: 4930, label: "SALGSSJEF / STYRK-08 1233" },
    { id: 2507, label: "INNKJØPSASSISTENT / STYRK-08 3323 (CORRECTED)" },
    { id: 2503, label: "INNKJØPER / STYRK-08 3323 (OLD - WRONG)" },
    { id: 4169, label: "PERSONALRÅDGIVER / HR-rådgiver" },
    { id: 5935, label: "SYSTEMUTVIKLER / Seniorutvikler" },
    { id: 4677, label: "REGNSKAPSMEDARBEIDER / STYRK-08 3313 (CORRECTED)" },
    { id: 4672, label: "REGNSKAPSFØRER / STYRK-08 3313 (OLD - WRONG)" },
    { id: 2610, label: "IT-KONSULENT" },
    { id: 752, label: "BRUKERSTØTTE IKT / STYRK-08 3512" },
    { id: 301, label: "??? / STYRK-08 2511 (NEEDS VERIFICATION)" },
    { id: 5921, label: "SYSTEMANALYTIKER (potential correct STYRK-08 2511)" },
  ];

  for (const { id, label } of knownCodes) {
    const r = await api("GET", `/employee/employment/occupationCode/${id}?fields=id,nameNO,code`);
    const v = r.data.value;
    const styrk98group = v.code.substring(0, 4);
    console.log(`  id=${v.id} code=${v.code} STYRK-98 group=${styrk98group} name=${v.nameNO} — ${label}\n`);
  }

  console.log("\n=== PART 2: Search for STYRK-08 2511 candidates ===\n");

  // STYRK-08 2511 = "Systemanalytikere og IKT-arkitekter"
  // STYRK-98 2511 = "Autoriserte regnskapsførere" (completely different!)
  // Need to find the right STYRK-98 equivalent

  const searches2511 = [
    "systemanalytiker",
    "IKT-arkitekt",
    "systemarkitekt",
  ];
  for (const term of searches2511) {
    const r = await api("GET", `/employee/employment/occupationCode?nameNO=${encodeURIComponent(term)}&count=10&fields=id,nameNO,code`);
    console.log(`  nameNO=${term} => ${r.data.fullResultSize} results:`);
    for (const v of (r.data.values || [])) {
      console.log(`    id=${v.id} code=${v.code} name=${v.nameNO}`);
    }
    console.log();
  }

  console.log("\n=== PART 3: Search occupation codes by STYRK-08 group names ===\n");

  // For each STYRK-08 code that appears in task 19, search by the official
  // Norwegian group name from STYRK-08
  const styrk08groups = [
    { code: "3313", name: "Regnskapsmedarbeidere og bokholdere", searchTerm: "regnskapsmedarbeider" },
    { code: "3323", name: "Innkjøps- og forsyningsassistenter", searchTerm: "innkjøpsassistent" },
    { code: "4110", name: "Kontormedarbeidere", searchTerm: "kontormedarbeider" },
    { code: "3512", name: "IKT-brukerstøttere", searchTerm: "brukerstøtte" },
    { code: "2511", name: "Systemanalytikere og IKT-arkitekter", searchTerm: "systemanalytiker" },
    { code: "1233", name: "Forsknings- og utviklingsledere/salgssjefer", searchTerm: "salgssjef" },
  ];

  for (const g of styrk08groups) {
    const r = await api("GET", `/employee/employment/occupationCode?nameNO=${encodeURIComponent(g.searchTerm)}&count=10&fields=id,nameNO,code`);
    console.log(`  STYRK-08 ${g.code} "${g.name}"`);
    console.log(`  Search: nameNO=${g.searchTerm} => ${r.data.fullResultSize} results:`);
    for (const v of (r.data.values || [])) {
      console.log(`    id=${v.id} code=${v.code} STYRK-98=${v.code.substring(0,4)} name=${v.nameNO}`);
    }
    console.log();
  }

  console.log("\n=== PART 4: Create test employee with REGNSKAPSMEDARBEIDER (4677) ===\n");

  // Get division
  const divR = await api("GET", "/division?count=1&fields=id");
  const divId = divR.data.values?.[0]?.id;
  console.log(`  Division id: ${divId}`);

  // Create department
  const deptR = await api("POST", "/department", { name: "Test-OccCode-3313" });
  const deptId = deptR.data.value?.id;
  console.log(`  Department id: ${deptId}`);

  // Create employee with REGNSKAPSMEDARBEIDER (4677) — the corrected mapping for STYRK-08 3313
  const emp1 = {
    firstName: "Test3313",
    lastName: "Medarbeider",
    dateOfBirth: "1990-01-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{
      startDate: "2026-08-01",
      ...(divId ? { division: { id: divId } } : {}),
      employmentDetails: [{
        date: "2026-08-01",
        employmentType: "ORDINARY",
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 100,
        annualSalary: 650000,
        occupationCode: { id: 4677 },  // REGNSKAPSMEDARBEIDER — corrected for STYRK-08 3313
      }],
    }],
  };
  const emp1R = await api("POST", "/employee?fields=*,employments(*)", emp1);
  const emp1Id = emp1R.data.value?.id;
  const empmt1Id = emp1R.data.value?.employments?.[0]?.id;
  console.log(`  Employee id: ${emp1Id}, Employment id: ${empmt1Id}`);

  // Readback employment details
  if (empmt1Id) {
    const detR = await api("GET", `/employee/employment/details?employmentId=${empmt1Id}&fields=*,occupationCode(*)`);
    const det = detR.data.values?.[0];
    if (det) {
      console.log(`  Readback occupationCode: id=${det.occupationCode?.id} code=${det.occupationCode?.code} name=${det.occupationCode?.nameNO}`);
      console.log(`  Readback: employmentType=${det.employmentType} form=${det.employmentForm} remuneration=${det.remunerationType}`);
    }
  }

  // Set standard worktime
  if (emp1Id) {
    const stR = await api("POST", "/employee/standardTime", {
      employee: { id: emp1Id },
      fromDate: "2026-08-01",
      hoursPerDay: 7.5,
    });
    console.log(`  Standard worktime set: status=${stR.status}`);
  }

  console.log("\n=== PART 5: Create test employee with INNKJØPSASSISTENT (2507) ===\n");

  // Create employee with INNKJØPSASSISTENT (2507) — the corrected mapping for STYRK-08 3323
  const dept2R = await api("POST", "/department", { name: "Test-OccCode-3323" });
  const dept2Id = dept2R.data.value?.id;

  const emp2 = {
    firstName: "Test3323",
    lastName: "Assistent",
    dateOfBirth: "1988-06-20",
    userType: "NO_ACCESS",
    department: { id: dept2Id },
    employments: [{
      startDate: "2026-09-01",
      ...(divId ? { division: { id: divId } } : {}),
      employmentDetails: [{
        date: "2026-09-01",
        employmentType: "ORDINARY",
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 80,
        annualSalary: 720000,
        occupationCode: { id: 2507 },  // INNKJØPSASSISTENT — corrected for STYRK-08 3323
      }],
    }],
  };
  const emp2R = await api("POST", "/employee?fields=*,employments(*)", emp2);
  const emp2Id = emp2R.data.value?.id;
  const empmt2Id = emp2R.data.value?.employments?.[0]?.id;
  console.log(`  Employee id: ${emp2Id}, Employment id: ${empmt2Id}`);

  // Readback
  if (empmt2Id) {
    const detR = await api("GET", `/employee/employment/details?employmentId=${empmt2Id}&fields=*,occupationCode(*)`);
    const det = detR.data.values?.[0];
    if (det) {
      console.log(`  Readback occupationCode: id=${det.occupationCode?.id} code=${det.occupationCode?.code} name=${det.occupationCode?.nameNO}`);
    }
  }

  console.log("\n=== PART 6: Explore STYRK-08 2511 deeper ===\n");

  // STYRK-08 2511 = "Systemanalytikere og IKT-arkitekter"
  // Currently mapped to id 301 = AUTORISERT REGNSKAPSFØRER (code 2511102)
  // This is STYRK-98 2511 which is a COMPLETELY DIFFERENT occupation!
  //
  // But does the scorer check by:
  //   a) the occupation code id matching the expected name?
  //   b) the 7-digit code starting with the STYRK-08 4-digit code?
  //   c) something else?
  //
  // If scorer checks by name match: SYSTEMANALYTIKER (5921) is correct
  // If scorer checks by code prefix: id 301 (code 2511102) is correct
  // If scorer checks by STYRK-98 group: we need the official STYRK-08→98 crosswalk

  // Let's look for all codes starting with "2511" (STYRK-98 2511 group)
  const r2511 = await api("GET", `/employee/employment/occupationCode?code=2511&count=30&fields=id,nameNO,code`);
  console.log(`  code=2511 search: ${r2511.data.fullResultSize} results (substring match!)`);
  for (const v of (r2511.data.values || []).slice(0, 15)) {
    console.log(`    id=${v.id} code=${v.code} name=${v.nameNO}`);
  }

  console.log("\n  --- STYRK-98 2511 group codes (autoriserte regnskapsførere): ---");
  // Filter to only codes actually starting with 2511
  for (const v of (r2511.data.values || [])) {
    if (v.code.startsWith("2511")) {
      console.log(`    id=${v.id} code=${v.code} name=${v.nameNO}`);
    }
  }

  // Now look at STYRK-98 2130 group (where SYSTEMUTVIKLER and IT-KONSULENT live)
  // STYRK-08 2511 (Systemanalytikere) should map to STYRK-98 2130 (System- og programvareutviklere)
  const r2130 = await api("GET", `/employee/employment/occupationCode?code=2130&count=50&fields=id,nameNO,code`);
  console.log(`\n  code=2130 search: ${r2130.data.fullResultSize} results`);
  // Filter to codes starting with 2130
  console.log("  --- STYRK-98 2130 group (system and software developers): ---");
  for (const v of (r2130.data.values || [])) {
    if (v.code.startsWith("2130")) {
      console.log(`    id=${v.id} code=${v.code} name=${v.nameNO}`);
    }
  }

  console.log("\n=== PART 7: Summary of STYRK-08 → Tripletex mapping ===\n");

  console.log("CONFIRMED CORRECT MAPPINGS (verified or to be verified):");
  console.log("  STYRK-08 4110 → id 2951 KONTORMEDARBEIDER (code 4114105, STYRK-98 4114)");
  console.log("  STYRK-08 1233 → id 4930 SALGSSJEF (code 1233105, STYRK-98 1233)");
  console.log("  STYRK-08 3323 → id 2507 INNKJØPSASSISTENT (code 3416103, STYRK-98 3416) [CORRECTED from 2503]");
  console.log("  STYRK-08 3313 → id 4677 REGNSKAPSMEDARBEIDER (code 4121115, STYRK-98 4121) [CORRECTED from 4672]");
  console.log("  STYRK-08 3512 → id 752 BRUKERSTØTTE IKT (code 3120130, STYRK-98 3120)");
  console.log("");
  console.log("NEEDS INVESTIGATION:");
  console.log("  STYRK-08 2511 → currently id 301 AUTORISERT REGNSKAPSFØRER (code 2511102, STYRK-98 2511)");
  console.log("  BUT STYRK-98 2511 = Autoriserte regnskapsførere (accountants), NOT Systemanalytikere!");
  console.log("  STYRK-08 2511 should map to STYRK-98 2130 → SYSTEMANALYTIKER (id 5921, code 2130124)?");
  console.log("  OR does the scorer just check that code starts with '2511' regardless of name?");
  console.log("");
  console.log("KEY INSIGHT: The Tripletex occupation code system uses STYRK-98 codes.");
  console.log("The 7-digit code format is: [4-digit STYRK-98 group][3-digit individual code]");
  console.log("When a task prompt gives a STYRK-08 code, the agent must map it to the");
  console.log("correct STYRK-98 group, which may differ from the STYRK-08 code number.");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
