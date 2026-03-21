const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: h };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) {
    console.error("ERROR:", text);
    return null;
  }
  if (!text) return null;
  const json = JSON.parse(text);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function main() {
  // 1. Verify occupation code id 4169 is PERSONALRÅDGIVER
  console.log("=== Verifying occupation code 4169 ===");
  const occCheck = await api("GET", "/employee/employment/occupationCode?nameNO=personalrådgiver&count=10&fields=id,nameNO,code");
  console.log("Results:", JSON.stringify(occCheck, null, 2));

  // 2. Also check what HR-rådgiver returns
  console.log("\n=== Checking nameNO=HR-rådgiver ===");
  const hrCheck = await api("GET", "/employee/employment/occupationCode?nameNO=HR-rådgiver&count=10&fields=id,nameNO,code");
  console.log("Results:", JSON.stringify(hrCheck, null, 2));

  // 3. Also check what 'rådgiver' returns to see other options
  console.log("\n=== Checking nameNO=rådgiver (broader) ===");
  const broadCheck = await api("GET", "/employee/employment/occupationCode?nameNO=rådgiver&count=10&fields=id,nameNO,code");
  console.log("Results:", JSON.stringify(broadCheck, null, 2));

  // 4. Verify a test employee creation with hardcoded id 4169 in sandbox
  console.log("\n=== Creating test employee with occupationCode id 4169 ===");
  const divResult = await api("GET", "/division?count=1&fields=id");
  const divId = Array.isArray(divResult) && divResult.length > 0 ? divResult[0].id : null;
  console.log("Division ID:", divId);

  const dept = await api("POST", "/department", { name: "HR-verify-" + Date.now() });
  if (!dept) { console.log("Department creation failed"); return; }
  console.log("Department ID:", dept.id);

  const emp = await api("POST", "/employee", {
    firstName: "Test",
    lastName: "HRRådgiver",
    dateOfBirth: "1990-01-15",
    userType: "NO_ACCESS",
    department: { id: dept.id },
    employments: [{
      startDate: "2026-10-21",
      ...(divId ? { division: { id: divId } } : {}),
      employmentDetails: [{
        date: "2026-10-21",
        employmentType: "ORDINARY",
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 100,
        annualSalary: 650000,
        occupationCode: { id: 4169 },
      }],
    }],
  });
  if (!emp) { console.log("Employee creation failed"); return; }
  console.log("Employee created, ID:", emp.id);

  // Get employment ID for readback
  const empId = emp.employments?.[0]?.id;
  console.log("Employment ID:", empId);

  // 5. Readback employment details
  if (empId) {
    console.log("\n=== Readback employment details ===");
    const details = await api("GET", `/employee/employment/details?employmentId=${empId}&fields=*,occupationCode(*)`);
    console.log("Details:", JSON.stringify(details, null, 2));
  }

  // 6. Verify standard time works
  console.log("\n=== Creating standard time ===");
  const stdTime = await api("POST", "/employee/standardTime", {
    employee: { id: emp.id },
    fromDate: "2026-10-21",
    hoursPerDay: 7.5,
  });
  console.log("Standard time:", JSON.stringify(stdTime, null, 2));

  // 7. Readback standard time
  console.log("\n=== Readback standard time ===");
  const stdTimeRead = await api("GET", `/employee/standardTime?employeeId=${emp.id}&fields=*`);
  console.log("Standard time readback:", JSON.stringify(stdTimeRead, null, 2));

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
