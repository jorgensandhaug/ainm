const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.log(`  ERROR: ${text.substring(0, 500)}`);
  return { status: r.status, ok: r.ok, data: r.ok ? JSON.parse(text) : text };
}

async function main() {
  // 1. Check if sandbox has divisions
  const divRes = await api("GET", "division?count=1&fields=id");
  const hasDivisions = divRes.ok && divRes.data.count > 0;
  const divId = hasDivisions ? divRes.data.values[0].id : null;
  console.log(`\n=== Sandbox has divisions: ${hasDivisions}, divId: ${divId} ===\n`);

  // 2. Try POST /employee WITHOUT division on account that HAS divisions
  if (hasDivisions) {
    console.log("=== TEST 1: POST /employee WITHOUT division (account HAS divisions) ===");
    const dept1 = await api("POST", "department", { name: "TestNoDivision" });
    if (dept1.ok) {
      const emp1 = await api("POST", "employee", {
        firstName: "TestNoDivision",
        lastName: "Worker",
        dateOfBirth: "1990-01-01",
        userType: "NO_ACCESS",
        department: { id: dept1.data.value.id },
        employments: [{
          startDate: "2026-12-06",
          // NO division field
          employmentDetails: [{
            date: "2026-12-06",
            employmentType: "NOT_CHOSEN",
            employmentForm: "PERMANENT",
            remunerationType: "MONTHLY_WAGE",
            workingHoursScheme: "NOT_CHOSEN",
            percentageOfFullTimeEquivalent: 100,
            annualSalary: 500000,
            occupationCode: { id: 4679 },
          }],
        }],
      });
      if (emp1.ok) {
        console.log("  SUCCESS: Employee created WITHOUT division! ID:", emp1.data.value.id);
        // Check if division was auto-assigned
        const readback = await api("GET", `employee/${emp1.data.value.id}?fields=*`);
        if (readback.ok) {
          const emps = readback.data.value.employments;
          console.log("  Readback employments[0].division:", emps?.[0]?.division);
        }
      } else {
        console.log("  FAILED: Cannot create employee without division when account has divisions");
      }
    }
  }

  // 3. Try POST /employee WITH division
  console.log("\n=== TEST 2: POST /employee WITH division (normal flow) ===");
  const dept2 = await api("POST", "department", { name: "TestWithDiv" });
  if (dept2.ok) {
    const empPayload: any = {
      firstName: "TestWithDiv",
      lastName: "Worker",
      dateOfBirth: "1990-02-02",
      userType: "NO_ACCESS",
      department: { id: dept2.data.value.id },
      employments: [{
        startDate: "2026-12-06",
        employmentDetails: [{
          date: "2026-12-06",
          employmentType: "NOT_CHOSEN",
          employmentForm: "PERMANENT",
          remunerationType: "MONTHLY_WAGE",
          workingHoursScheme: "NOT_CHOSEN",
          percentageOfFullTimeEquivalent: 100,
          annualSalary: 500000,
          occupationCode: { id: 4679 },
        }],
      }],
    };
    if (divId) empPayload.employments[0].division = { id: divId };
    const emp2 = await api("POST", "employee", empPayload);
    if (emp2.ok) {
      const empId = emp2.data.value.id;
      console.log("  SUCCESS: Employee created WITH division. ID:", empId);

      // 4. Check if POST /employee response includes standardTime or any way to set it inline
      console.log("\n=== TEST 3: Check employee response for standardTime fields ===");
      const readback2 = await api("GET", `employee/${empId}?fields=*`);
      if (readback2.ok) {
        const emp = readback2.data.value;
        console.log("  standardTime on employee object:", emp.standardTime);
        console.log("  hoursPerDay on employee object:", emp.hoursPerDay);
        // Check employment details
        const details = emp.employments?.[0]?.employmentDetails;
        if (details) {
          console.log("  employmentDetails[0] keys:", Object.keys(details[0]).join(", "));
          console.log("  hoursPerDay in details:", details[0].hoursPerDay);
          console.log("  standardTime in details:", details[0].standardTime);
        }
      }
    }
  }

  // 5. Quick re-verify NOT_CHOSEN readback
  console.log("\n=== TEST 4: Verify NOT_CHOSEN readback on fresh employee ===");
  const dept3 = await api("POST", "department", { name: "TestNotChosen" });
  if (dept3.ok) {
    const empPayload3: any = {
      firstName: "VerifyNotChosen",
      lastName: "Test",
      dateOfBirth: "1983-01-31",
      userType: "NO_ACCESS",
      department: { id: dept3.data.value.id },
      employments: [{
        startDate: "2026-12-06",
        employmentDetails: [{
          date: "2026-12-06",
          employmentType: "NOT_CHOSEN",
          employmentForm: "PERMANENT",
          remunerationType: "MONTHLY_WAGE",
          workingHoursScheme: "NOT_CHOSEN",
          percentageOfFullTimeEquivalent: 100,
          annualSalary: 620000,
          occupationCode: { id: 4679 },
        }],
      }],
    };
    if (divId) empPayload3.employments[0].division = { id: divId };
    const emp3 = await api("POST", "employee", empPayload3);
    if (emp3.ok) {
      const empId = emp3.data.value.id;
      console.log("  Employee created. ID:", empId);
      // Readback employment details
      const readback3 = await api("GET", `employee/${empId}?fields=id,employments(*)&expand=employments`);
      if (readback3.ok) {
        const details = readback3.data.value.employments?.[0]?.employmentDetails;
        if (details && details.length > 0) {
          console.log("  employmentType:", details[0].employmentType);
          console.log("  workingHoursScheme:", details[0].workingHoursScheme);
          console.log("  remunerationType:", details[0].remunerationType);
          console.log("  annualSalary:", details[0].annualSalary);
          console.log("  percentageOfFullTimeEquivalent:", details[0].percentageOfFullTimeEquivalent);
          console.log("  occupationCode:", JSON.stringify(details[0].occupationCode));
        }
      }
      // Also set standardTime and verify
      const stRes = await api("POST", "employee/standardTime", {
        employee: { id: empId },
        fromDate: "2026-12-06",
        hoursPerDay: 7.5,
      });
      if (stRes.ok) {
        console.log("  standardTime set. ID:", stRes.data.value.id);
        console.log("  hoursPerDay:", stRes.data.value.hoursPerDay);
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
