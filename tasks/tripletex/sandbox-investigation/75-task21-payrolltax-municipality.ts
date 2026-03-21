// Task 21 Check 5 - Test payrollTaxMunicipalityId
//
// HYPOTHESIS: What if Check 5 verifies payrollTaxMunicipalityId on
// employmentDetails? The company has a municipality setting, and the
// scorer might expect the employee to inherit it.
//
// Also testing: What municipality does this company use?
// And: Can we set payrollTaxMunicipalityId on creation?

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
  // Get company municipality
  console.log("=".repeat(80));
  console.log("TEST 1: Company municipality settings");
  console.log("=".repeat(80));

  const companyRes = await api("GET", "/company/1?fields=*");
  const company = val(companyRes);
  console.log("Company municipality:", JSON.stringify({
    municipality: company?.municipality,
    payrollTaxCalcMethod: company?.payrollTaxCalcMethod,
  }, null, 2));

  // Check salary settings for municipality info
  const salRes = await api("GET", "/salary/settings?fields=*");
  console.log("Salary settings:", JSON.stringify(val(salRes), null, 2));

  // Check division municipality
  const divRes = await api("GET", "/division?count=1&fields=*,municipality(*)");
  const divData = val(divRes)?.[0];
  const divId = divData?.id;
  console.log("Division:", JSON.stringify(divData, null, 2));
  const municipalityId = divData?.municipality?.id;
  console.log("Municipality ID from division:", municipalityId);

  // Get municipality details
  if (municipalityId) {
    const munRes = await api("GET", `/municipality/${municipalityId}?fields=*`);
    console.log("Municipality:", JSON.stringify(val(munRes), null, 2));
  }

  console.log("\n" + "=".repeat(80));
  console.log("TEST 2: Create employee WITH payrollTaxMunicipalityId");
  console.log("=".repeat(80));

  const deptRes = await api("POST", "/department", { name: "MuniTest-Dept" });
  const deptId = val(deptRes)?.id;

  // Try creating with payrollTaxMunicipalityId set
  const empRes = await api("POST", "/employee", {
    firstName: "MuniTest",
    lastName: "Employee",
    dateOfBirth: "1995-06-06",
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
        payrollTaxMunicipalityId: { id: municipalityId },
      }],
    }],
  });
  const emp = val(empRes);
  const emplId = emp?.employments?.[0]?.id;

  // Readback
  const detRb = await api("GET", `/employee/employment/details?employmentId=${emplId}&fields=*,occupationCode(*)`);
  const det = val(detRb)?.[0];
  console.log("payrollTaxMunicipalityId readback:", JSON.stringify(det?.payrollTaxMunicipalityId, null, 2));

  console.log("\n" + "=".repeat(80));
  console.log("TEST 3: List all municipalities (first few)");
  console.log("=".repeat(80));

  const munListRes = await api("GET", "/municipality?count=5&fields=*");
  console.log("First 5 municipalities:", JSON.stringify(val(munListRes), null, 2)?.slice(0, 1000));

  console.log("\n" + "=".repeat(80));
  console.log("TEST 4: What about creating employment with isMainEmployer explicitly true?");
  console.log("=".repeat(80));

  const emp2Res = await api("POST", "/employee", {
    firstName: "MainEmpl",
    lastName: "TestF",
    dateOfBirth: "1995-07-07",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{
      startDate: "2026-09-01",
      division: { id: divId },
      isMainEmployer: true,
      taxDeductionCode: "loennFraHovedarbeidsgiver",
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
  console.log("Explicit isMainEmployer+taxDeduction:", emp2Res.status);

  if (emp2Res.status === 201) {
    const empl2Id = val(emp2Res)?.employments?.[0]?.id;
    const emplRb = await api("GET", `/employee/employment/${empl2Id}?fields=isMainEmployer,taxDeductionCode`);
    console.log("Employment readback:", JSON.stringify(val(emplRb), null, 2));
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
