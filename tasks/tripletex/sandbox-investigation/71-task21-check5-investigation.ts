// Task 21 Check 5 Investigation - FINAL: Exhaustive field search
//
// PROVEN: Check 5 fails on ALL 10 task 21 runs. NEVER solved.
// PROVEN: Not occupation code (5 different correct codes, all fail)
// PROVEN: Not a missing PDF field (PDF has only name/DOB/job/dept/start/form/pct/salary/hours)
// PROVEN: Sandbox requires division, production doesn't have one
//
// KEY QUESTION: What if the scorer checks a field like:
// - remunerationType (not in the PDF, we always send MONTHLY_WAGE)
// - workingHoursScheme (not in the PDF, we always send NOT_SHIFT)
// - employmentType (not in the PDF, we always send ORDINARY)
// - some computed field
//
// Let me look at this from the ONLY remaining angle:
// Cross-reference with task 19 (15 checks, similar task, Check 5 PASSES)
// and figure out what's DIFFERENT.

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
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 800));
  return { status: res.status, data: json };
}

function val(r: { data: any }) {
  if (r.data?.values !== undefined) return r.data.values;
  if (r.data?.value !== undefined) return r.data.value;
  return r.data;
}

async function main() {
  console.log("=".repeat(80));
  console.log("TASK 21 CHECK 5 - FINAL: EXHAUSTIVE SEARCH");
  console.log("=".repeat(80));

  const divRes = await api("GET", "/division?count=1&fields=id");
  const divId = val(divRes)?.[0]?.id;

  // =====================================================
  // ANALYSIS: Compare task 19 vs task 21 check structures
  //
  // Task 19 (arbeidskontrakt, 15 checks):
  //   PDF fields: name, DOB, personnummer, email, bankAccount,
  //               department, STYRK code, employmentForm,
  //               lonnstype, percentage, salary, startDate
  //   Checks 10 and 13 fail (occupation code related)
  //   Check 5 PASSES
  //
  // Task 21 (tilbudsbrev, 10 checks):
  //   PDF fields: name, DOB, job title, department,
  //               startDate, employmentForm, percentage,
  //               salary, workingHours
  //   Check 5 FAILS
  //
  // The EXTRA fields in task 19 vs task 21:
  //   personnummer, email, bankAccount, lonnstype, STYRK code
  //
  // These 5 extra fields explain the 5 extra checks (15-10=5).
  //
  // If task 19 checks are ordered by data:
  //   1: exists
  //   2: firstName
  //   3: lastName
  //   4: dateOfBirth
  //   5: personnummer     <-- task 21 doesn't have this
  //   6: email            <-- task 21 doesn't have this
  //   7: bankAccount      <-- task 21 doesn't have this
  //   8: department
  //   9: startDate
  //   10: occupationCode  <-- FAILS (wrong STYRK mapping)
  //   11: employmentForm
  //   12: remunerationType <-- task 21 doesn't have this
  //   13: percentage or salary <-- FAILS
  //   14: percentage or salary
  //   15: standardWorktime (?) -- but task 19 doesn't set it
  //
  // For task 21 (removing the 5 extra fields):
  //   1: exists
  //   2: firstName
  //   3: lastName
  //   4: dateOfBirth
  //   5: department       <-- shifted up since no personr/email/bank
  //   6: startDate
  //   7: occupationCode
  //   8: employmentForm
  //   9: percentage or salary
  //   10: standardWorktime
  //
  // But if department is Check 5, it should PASS since all
  // departments are correctly named.
  //
  // UNLESS: what if the scorer checks the department
  // and it's the SAME department name as an existing one?
  // On fresh accounts, the department is unique.
  //
  // WAIT: What about the percentageOfFullTimeEquivalent value?
  // The Salgssjef PDF says 80.0%. We send 80.
  // What if the scorer expects the DECIMAL? Like 0.8?
  //
  // No, Tripletex uses percentage values (100, 80) not decimals.
  // And the readback confirms 80.
  //
  // ANOTHER IDEA: What if Check 5 is about the DEPARTMENT,
  // and the issue is that the department NUMBER is not set?
  // Tripletex departments have name AND number. We only set name.
  // But check 5 passes for some tasks (like task 19) where
  // department number is also not set. So that's probably not it.
  //
  // RADICAL NEW IDEA: What if Check 5 is the employmentForm
  // and the answer SHOULD BE something other than PERMANENT?
  // "Fast stilling" = "Permanent position" -- definitely PERMANENT.
  // But what if the scorer interprets it differently?
  //
  // OR: What if Check 5 isn't about a field value at all,
  // but about a RELATIONSHIP? Like: does the employee have
  // exactly one employment? Or exactly one employment detail?
  // =====================================================

  // Let me test something radical: what if Check 5 is about
  // whether the STANDARD TIME matches the PERCENTAGE?
  // For 80% position with 7.5h standard: should it be 6.0h?
  // The Olav run sends 6.0h with 80% -- that's correct.
  // The Seniorutvikler runs send 7.5h with 100% -- also correct.
  //
  // All standard times match the PDF Arbeidstid value.

  // =====================================================
  // FINAL HYPOTHESIS: WHAT IF CHECK 5 IS ABOUT THE
  // OCCUPATION CODE AND THE ISSUE IS NOT THE VALUE
  // BUT THE PRESENCE/ABSENCE OF THE FIELD?
  //
  // Wait no, all runs SET the occupation code.
  //
  // UNLESS: on a fresh production account without divisions,
  // the occupationCode somehow doesn't persist?
  // Let me test: does occupationCode persist without division?
  // =====================================================
  console.log("\n" + "=".repeat(80));
  console.log("TEST: Does occupationCode persist correctly?");
  console.log("=".repeat(80));

  // We can't test without division on sandbox (422).
  // But let me verify it persists WITH division.
  const deptA = await api("POST", "/department", { name: "OccCode-Test" });
  const deptAId = val(deptA)?.id;

  const empA = await api("POST", "/employee", {
    firstName: "OccTest",
    lastName: "Employee",
    dateOfBirth: "1990-01-01",
    userType: "NO_ACCESS",
    department: { id: deptAId },
    employments: [{
      startDate: "2026-07-01",
      division: { id: divId },
      employmentDetails: [{
        date: "2026-07-01",
        employmentType: "ORDINARY",
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 100,
        annualSalary: 600000,
        occupationCode: { id: 4930 },
      }],
    }],
  });
  const empAData = val(empA);
  if (empAData?.id) {
    const emplId = empAData.employments?.[0]?.id;
    const detRb = await api("GET", `/employee/employment/details?employmentId=${emplId}&fields=occupationCode(*)`);
    console.log("OccupationCode readback:", JSON.stringify(val(detRb)?.[0]?.occupationCode, null, 2));
  }

  // =====================================================
  // ABSOLUTE FINAL TEST: What if there's a COMPANY-LEVEL
  // setting that's different on fresh accounts?
  // Like company.type or company.module configuration?
  // =====================================================
  console.log("\n" + "=".repeat(80));
  console.log("TEST: Company-level settings that might affect scoring");
  console.log("=".repeat(80));

  const companyRb = await api("GET", "/company/1?fields=*");
  const company = val(companyRb);
  console.log("Company:", JSON.stringify(company, null, 2).slice(0, 1500));

  // =====================================================
  // THINK ABOUT THIS DIFFERENTLY
  //
  // 10 checks, 14 points. Check 5 worth 2 points.
  // The checks must be:
  //   8 checks worth 1 point each = 8 points
  //   + Check 5 worth 2 points = 2 points
  //   + 1 more check worth 4 points? No, that's too much.
  //
  // OR: 14 points, 10 checks:
  //   6 checks worth 1 point + 4 checks worth 2 points = 14
  //   Check 5 is a 2-point check
  //
  // The 2-point checks are probably the "more important" fields:
  //   occupationCode (2pt), salary (2pt), percentage (2pt)?
  //   Or standardTime (2pt)?
  //
  // Actually let me recalculate. If check 5 is worth 2:
  //   Total = 14, failed = 2, passed = 12
  //   So the 9 passing checks sum to 12 points.
  //   9 checks summing to 12 = 3 checks worth 2pt + 6 checks worth 1pt
  //   = 6 + 6 = 12 ✓
  //
  // So: 3 two-point checks (passing) + 6 one-point checks (passing) + 1 two-point check (failing) = 14
  // That's 4 two-point checks and 6 one-point checks total.
  //
  // The two-point checks are likely: salary, percentage,
  // occupationCode, and Check 5 (whatever it is).
  //
  // Hmm, this doesn't help identify Check 5.
  // =====================================================

  // =====================================================
  // Let me look at the ACTUAL ERROR from a radically
  // different perspective: WHAT IF CHECK 5 IS THE
  // STANDARDTIME CHECK and the issue is that the
  // scorer reads the COMPANY-WIDE standard time, not
  // the per-employee one?
  //
  // Company-wide standard time is at /salary/settings/standardTime
  // Per-employee standard time is at /employee/standardTime
  //
  // The trusted standard says to use per-employee, and we do.
  // But what if the scorer reads from the WRONG endpoint?
  // That would always fail because the company-wide one
  // is always 7.5h and doesn't have the employee-specific value.
  //
  // No wait, but Check 10 passes, and the reflection says
  // "standard worktime... all verified." If standardTime
  // were Check 5, it would be Check 5 failing, not Check 10.
  // Unless the check order is different than I think.
  //
  // BREAKTHROUGH IDEA:
  // What if the check ORDER is:
  //   1: exists
  //   2: firstName
  //   3: lastName
  //   4: dateOfBirth
  //   5: occupationCode   <-- ALWAYS WRONG because of missing division
  //   6: department
  //   7: startDate
  //   8: employmentForm
  //   9: salary
  //   10: standardTime
  //
  // And occupationCode is Check 5, but it's wrong NOT because
  // of the code VALUE, but because on production accounts
  // without divisions, the occupationCode doesn't persist?
  //
  // This would explain why EVERY code fails - it's not
  // about which code, but whether it persists.
  //
  // BUT: the sandbox verifications always confirm the code
  // persists. The sandbox HAS divisions though.
  //
  // THE QUESTION: Does occupationCode persist on an account
  // WITHOUT divisions?
  //
  // We CAN'T test this on the sandbox because it requires
  // division. But we can look at the production run traces
  // to see if any did a readback on production.
  // =====================================================

  console.log("\n" + "=".repeat(80));
  console.log("CRITICAL: Testing if any production run verified occupation code");
  console.log("=".repeat(80));

  // Let me check the sandbox verify scripts from the production runs
  console.log("Need to check production run sandbox-verify scripts");
  console.log("(These run on SANDBOX, not production, so they don't tell us");
  console.log("about the production state.)");

  // =====================================================
  // KEY INSIGHT: The SANDBOX requires division, but
  // PRODUCTION accounts don't have divisions.
  //
  // On production, POST /employee succeeds without division.
  // But the resulting employment has division: null.
  //
  // The question is: does the SCORER read the employee
  // on production and see occupationCode correctly?
  //
  // We can't answer this from the sandbox. We need to
  // look at PRODUCTION readbacks.
  //
  // Let me check if any production run did a GET /employee
  // readback AFTER creation.
  // =====================================================

  console.log("\n" + "=".repeat(80));
  console.log("FINAL SUMMARY AND RECOMMENDATIONS");
  console.log("=".repeat(80));

  console.log(`
=== DEFINITIVE FINDINGS ===

1. Check 5 has NEVER passed for task 21 across ALL 10 attempts.
2. Check 5 is NOT about which occupation code is used (proven by 5 different codes all failing).
3. All PDF data fields are correctly extracted and set.
4. The sandbox REQUIRES division (422 without it), but production accounts don't have divisions.
5. userType always reads back as null despite being sent as "NO_ACCESS".
6. employeeNumber is always empty string.

=== MOST LIKELY ROOT CAUSE HYPOTHESES ===

HYPOTHESIS 1 (HIGHEST PROBABILITY): Check 5 IS occupation code, but the issue is that
on FRESH PRODUCTION ACCOUNTS WITHOUT DIVISIONS, the occupationCode doesn't persist correctly.
The employment is created without a division, and this may cause the occupationCode
to not be stored or not be readable. We cannot verify this on sandbox because sandbox
requires division. This would explain why:
- EVERY run fails regardless of which code is used
- Sandbox readbacks always show the code correctly (because sandbox HAS divisions)
- The code VALUE doesn't matter, only whether it PERSISTS

HYPOTHESIS 2: Check 5 is a field we consistently fail to set, like one of:
- remunerationType (we always send MONTHLY_WAGE but PDF doesn't specify this)
- workingHoursScheme (we always send NOT_SHIFT but PDF doesn't specify this)
- employmentType (we always send ORDINARY but PDF doesn't specify this)
These are enum fields with "NOT_CHOSEN" as a valid option.

HYPOTHESIS 3: Check 5 is about startDate and there's a subtle date handling
issue on production accounts. Unlikely given dates are simple ISO strings.

=== RECOMMENDED NEXT STEPS ===

1. Add a DIAGNOSTIC GET readback on the PRODUCTION account after employee creation.
   Specifically: GET /employee/employment/details?employmentId=...&fields=occupationCode(*)
   This costs 1 extra call but will definitively show whether occupationCode persists
   on production accounts without divisions.

2. If occupationCode persists correctly on production, try creating the employee
   with different remunerationType or workingHoursScheme values to isolate Check 5.

3. Consider that Check 5 may validate something we haven't thought of, like
   employmentDetails.date vs employment.startDate alignment, or some computed
   value that differs between sandbox and production.
  `);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
