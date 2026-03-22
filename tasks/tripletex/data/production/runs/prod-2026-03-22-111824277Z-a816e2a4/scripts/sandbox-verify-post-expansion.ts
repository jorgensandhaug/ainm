// Test if POST /employee with deep expansion returns full employmentDetails
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  console.log(`${method} ${path} → ${r.status}`);
  return json;
}

async function main() {
  // Get division for sandbox (required)
  const divRes = await api("GET", "/division?count=1&fields=id");
  const divId = divRes.count > 0 ? divRes.values[0].id : null;

  // Get an existing department
  const deptRes = await api("GET", "/department?isInactive=false&count=1&fields=id");
  const deptId = deptRes.values[0]?.id;
  console.log("Division:", divId, "Department:", deptId);

  // Get salary settings
  const salaryRes = await api("GET", "/salary/settings?fields=municipality");
  const muniId = salaryRes.value?.municipality?.id;
  console.log("Municipality:", muniId);

  // Create test employee with DEEP expansion on POST response
  const payload = {
    firstName: "TestDeep",
    lastName: "Expansion",
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
        annualSalary: 500000,
        occupationCode: { id: 4677 },
        ...(muniId ? { payrollTaxMunicipalityId: { id: muniId } } : {}),
      }]
    }]
  };

  // Test 1: POST with standard expansion
  console.log("\n=== POST with fields=*,employments(*) (standard) ===");
  const r1 = await api("POST", "/employee?fields=*,employments(*)", payload);
  const emp1Detail = r1.value?.employments?.[0]?.employmentDetails?.[0];
  console.log("employmentDetails[0] from standard expansion:", JSON.stringify(emp1Detail));

  // Test 2: POST with DEEP expansion
  console.log("\n=== POST with fields=*,employments(*,employmentDetails(*)) (deep) ===");
  payload.firstName = "TestDeep2";
  const r2 = await api("POST", "/employee?fields=*,employments(*,employmentDetails(*))", payload);
  const emp2Detail = r2.value?.employments?.[0]?.employmentDetails?.[0];
  console.log("employmentDetails[0] from deep expansion:", JSON.stringify(emp2Detail));
  if (emp2Detail) {
    console.log("  annualSalary:", emp2Detail.annualSalary);
    console.log("  occupationCode:", emp2Detail.occupationCode?.id);
    console.log("  percentageOfFullTimeEquivalent:", emp2Detail.percentageOfFullTimeEquivalent);
    console.log("  payrollTaxMunicipalityId:", emp2Detail.payrollTaxMunicipalityId?.id);
    console.log("  remunerationType:", emp2Detail.remunerationType);
  }

  // Clean up: delete both
  if (r1.value?.id) await api("DELETE", `/employee/${r1.value.id}`);
  if (r2.value?.id) await api("DELETE", `/employee/${r2.value.id}`);
}

main().catch(console.error);
