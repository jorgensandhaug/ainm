// Task 21 Check 5 - Test SEPARATE employment details creation
//
// HYPOTHESIS: What if the nested employmentDetails creation inside POST /employee
// doesn't fully link on production accounts without divisions, and a SEPARATE
// POST /employee/employment/details is needed?
//
// Also testing: What if we need to set the occupationCode via PUT on the
// employment details, not in the nested creation?
//
// AND: What does the employment look like when created WITHOUT nested details
// at all, vs WITH them?

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

function val(r: { data: any }) {
  if (r.data?.values !== undefined) return r.data.values;
  if (r.data?.value !== undefined) return r.data.value;
  return r.data;
}

async function main() {
  const divRes = await api("GET", "/division?count=1&fields=id");
  const divId = val(divRes)?.[0]?.id;

  const deptRes = await api("POST", "/department", { name: "SepCreate-Test" });
  const deptId = val(deptRes)?.id;

  console.log("=".repeat(80));
  console.log("TEST: Create employee WITHOUT nested employmentDetails");
  console.log("=".repeat(80));

  // Create employee with employment but NO employmentDetails
  const emp1Res = await api("POST", "/employee", {
    firstName: "SepCreate",
    lastName: "TestA",
    dateOfBirth: "1995-01-01",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{
      startDate: "2026-09-01",
      division: { id: divId },
    }],
  });
  const emp1 = val(emp1Res);
  console.log("Employee created:", emp1?.id);

  const empl1Id = emp1?.employments?.[0]?.id;
  console.log("Employment ID:", empl1Id);

  // Check what employmentDetails exist after creating without nested details
  const det1 = await api("GET", `/employee/employment/details?employmentId=${empl1Id}&fields=*,occupationCode(*)`);
  console.log("Details BEFORE separate POST:", JSON.stringify(val(det1), null, 2));

  // Now POST details separately
  const detPost = await api("POST", "/employee/employment/details", {
    employment: { id: empl1Id },
    date: "2026-09-01",
    employmentType: "ORDINARY",
    employmentForm: "PERMANENT",
    remunerationType: "MONTHLY_WAGE",
    workingHoursScheme: "NOT_SHIFT",
    percentageOfFullTimeEquivalent: 80,
    annualSalary: 550000,
    occupationCode: { id: 4930 },
  });
  console.log("Separate POST details result:", JSON.stringify(val(detPost), null, 2)?.slice(0, 500));

  // Read back
  const det2 = await api("GET", `/employee/employment/details?employmentId=${empl1Id}&fields=*,occupationCode(*)`);
  console.log("Details AFTER separate POST:", JSON.stringify(val(det2), null, 2));

  console.log("\n" + "=".repeat(80));
  console.log("TEST: What default details exist without specifying any?");
  console.log("=".repeat(80));

  // Sometimes Tripletex creates a DEFAULT detail row when you create an employment
  // Let's check if the detail we saw before the POST had defaults
  // Also check: what if we create WITHOUT employment at all?
  const emp2Res = await api("POST", "/employee", {
    firstName: "NoEmpl",
    lastName: "TestB",
    dateOfBirth: "1995-02-02",
    userType: "NO_ACCESS",
    department: { id: deptId },
  });
  const emp2 = val(emp2Res);
  console.log("Employee WITHOUT employment:", JSON.stringify(emp2, null, 2)?.slice(0, 1000));

  console.log("\n" + "=".repeat(80));
  console.log("TEST: PUT/update existing employment details");
  console.log("=".repeat(80));

  // Create employee with nested details (the normal way)
  const emp3Res = await api("POST", "/employee", {
    firstName: "PutTest",
    lastName: "TestC",
    dateOfBirth: "1995-03-03",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{
      startDate: "2026-09-01",
      division: { id: divId },
      employmentDetails: [{
        date: "2026-09-01",
        employmentType: "ORDINARY",
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 80,
        annualSalary: 550000,
        occupationCode: { id: 4930 },
      }],
    }],
  });
  const emp3 = val(emp3Res);
  const empl3Id = emp3?.employments?.[0]?.id;

  // Get the details ID
  const det3 = await api("GET", `/employee/employment/details?employmentId=${empl3Id}&fields=*`);
  const detId = val(det3)?.[0]?.id;
  const detVer = val(det3)?.[0]?.version;
  console.log("Detail ID:", detId, "Version:", detVer);

  // Try to PUT update the details to change something
  const putRes = await api("PUT", `/employee/employment/details/${detId}`, {
    id: detId,
    version: detVer,
    employment: { id: empl3Id },
    date: "2026-09-01",
    employmentType: "ORDINARY",
    employmentForm: "PERMANENT",
    remunerationType: "MONTHLY_WAGE",
    workingHoursScheme: "NOT_SHIFT",
    percentageOfFullTimeEquivalent: 80,
    annualSalary: 550000,
    occupationCode: { id: 4930 },
  });
  console.log("PUT result:", putRes.status, JSON.stringify(val(putRes), null, 2)?.slice(0, 500));

  console.log("\n" + "=".repeat(80));
  console.log("TEST: Create employee with TEMPORARY employmentForm");
  console.log("=".repeat(80));

  // What if "Fast stilling" should map to something different?
  // Let's see what "TEMPORARY" looks like
  const emp4Res = await api("POST", "/employee", {
    firstName: "TempTest",
    lastName: "TestD",
    dateOfBirth: "1995-04-04",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{
      startDate: "2026-09-01",
      division: { id: divId },
      employmentDetails: [{
        date: "2026-09-01",
        employmentType: "ORDINARY",
        employmentForm: "TEMPORARY",  // Try temporary
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 80,
        annualSalary: 550000,
        occupationCode: { id: 4930 },
      }],
    }],
  });
  console.log("TEMPORARY form creation:", emp4Res.status);

  console.log("\n" + "=".repeat(80));
  console.log("TEST: What about hourlyWage? Is it auto-computed or settable?");
  console.log("=".repeat(80));

  // hourlyWage is in the schema. What if we need to set it explicitly?
  const emp5Res = await api("POST", "/employee", {
    firstName: "HourlyTest",
    lastName: "TestE",
    dateOfBirth: "1995-05-05",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{
      startDate: "2026-09-01",
      division: { id: divId },
      employmentDetails: [{
        date: "2026-09-01",
        employmentType: "ORDINARY",
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 80,
        annualSalary: 550000,
        hourlyWage: 282,  // Try setting it explicitly
        occupationCode: { id: 4930 },
      }],
    }],
  });
  console.log("hourlyWage set explicitly:", emp5Res.status);
  if (emp5Res.status === 201) {
    const empl5Id = val(emp5Res)?.employments?.[0]?.id;
    const det5 = await api("GET", `/employee/employment/details?employmentId=${empl5Id}&fields=hourlyWage,annualSalary`);
    console.log("hourlyWage readback:", JSON.stringify(val(det5)?.[0], null, 2));
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
