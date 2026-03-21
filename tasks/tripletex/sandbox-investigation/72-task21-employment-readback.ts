// Task 21 Check 5 - Deep Employment-Level Readback
//
// Previous investigation exhaustively checked EmploymentDetails fields.
// This test focuses on EMPLOYMENT-level fields that might differ between
// sandbox (has division) and production (no division):
//   - isMainEmployer (defaults to true)
//   - taxDeductionCode (defaults based on isMainEmployer)
//   - noEmploymentRelationship
//   - employmentId (legacy string ID)
//
// Also checks: what happens when we create WITH vs WITHOUT division?
// On sandbox, we must include division. On production, we omit it.
// What if the absence of division causes isMainEmployer or taxDeductionCode
// to default differently?

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
  // Get division (sandbox requires it)
  const divRes = await api("GET", "/division?count=1&fields=id");
  const divId = val(divRes)?.[0]?.id;
  console.log("Division ID:", divId);

  // Create department
  const deptRes = await api("POST", "/department", { name: "Check5-Test-Dept" });
  const deptId = val(deptRes)?.id;

  // Create employee matching the exact task 21 shape (Salgssjef, 80%, 550k, 6h)
  const empRes = await api("POST", "/employee", {
    firstName: "Check5",
    lastName: "TestEmployee",
    dateOfBirth: "2000-03-18",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{
      startDate: "2026-07-24",
      division: { id: divId },
      employmentDetails: [{
        date: "2026-07-24",
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

  const emp = val(empRes);
  const empId = emp?.id;
  const emplId = emp?.employments?.[0]?.id;
  console.log("\nEmployee ID:", empId, "Employment ID:", emplId);

  // Set standard time
  await api("POST", "/employee/standardTime", {
    employee: { id: empId },
    fromDate: "2026-07-24",
    hoursPerDay: 6.0,
  });

  // ===== NOW READ BACK EVERYTHING =====
  console.log("\n" + "=".repeat(80));
  console.log("READBACK: Full Employee object");
  console.log("=".repeat(80));

  const empRb = await api("GET", `/employee/${empId}?fields=*,employments(*),department(*),employeeCategory(*),address(*)`);
  const empData = val(empRb);
  console.log(JSON.stringify(empData, null, 2));

  console.log("\n" + "=".repeat(80));
  console.log("READBACK: Full Employment object");
  console.log("=".repeat(80));

  const emplRb = await api("GET", `/employee/employment/${emplId}?fields=*,division(*),employee(*),employmentDetails(*)`);
  const emplData = val(emplRb);
  console.log(JSON.stringify(emplData, null, 2));

  console.log("\n" + "=".repeat(80));
  console.log("READBACK: Full EmploymentDetails");
  console.log("=".repeat(80));

  const detRb = await api("GET", `/employee/employment/details?employmentId=${emplId}&fields=*,occupationCode(*),employment(*)`);
  const detData = val(detRb);
  console.log(JSON.stringify(detData, null, 2));

  console.log("\n" + "=".repeat(80));
  console.log("READBACK: Standard Time");
  console.log("=".repeat(80));

  const stRb = await api("GET", `/employee/standardTime?employeeId=${empId}&fields=*`);
  const stData = val(stRb);
  console.log(JSON.stringify(stData, null, 2));

  // ===== KEY COMPARISON: EMPLOYMENT-LEVEL FIELDS =====
  console.log("\n" + "=".repeat(80));
  console.log("KEY EMPLOYMENT-LEVEL FIELDS");
  console.log("=".repeat(80));

  const empl = emplData;
  console.log("isMainEmployer:", empl?.isMainEmployer);
  console.log("taxDeductionCode:", empl?.taxDeductionCode);
  console.log("noEmploymentRelationship:", empl?.noEmploymentRelationship);
  console.log("employmentId:", JSON.stringify(empl?.employmentId));
  console.log("startDate:", empl?.startDate);
  console.log("endDate:", empl?.endDate);
  console.log("division:", JSON.stringify(empl?.division));

  // ===== CHECK: What does /employee/employment endpoint list? =====
  console.log("\n" + "=".repeat(80));
  console.log("LIST: All employments for this employee");
  console.log("=".repeat(80));

  const emplListRb = await api("GET", `/employee/employment?employeeId=${empId}&fields=*`);
  const emplList = val(emplListRb);
  console.log(JSON.stringify(emplList, null, 2));

  // ===== EMPLOYEE-LEVEL FIELDS THAT MIGHT MATTER =====
  console.log("\n" + "=".repeat(80));
  console.log("KEY EMPLOYEE-LEVEL FIELDS");
  console.log("=".repeat(80));

  console.log("employeeNumber:", JSON.stringify(empData?.employeeNumber));
  console.log("email:", JSON.stringify(empData?.email));
  console.log("phoneNumberMobile:", JSON.stringify(empData?.phoneNumberMobile));
  console.log("nationalIdentityNumber:", JSON.stringify(empData?.nationalIdentityNumber));
  console.log("bankAccountNumber:", JSON.stringify(empData?.bankAccountNumber));
  console.log("userType:", empData?.userType);
  console.log("isContact:", empData?.isContact);
  console.log("allowInformationRegistration:", empData?.allowInformationRegistration);
  console.log("comments:", JSON.stringify(empData?.comments));
  console.log("address:", JSON.stringify(empData?.address));
  console.log("employeeCategory:", JSON.stringify(empData?.employeeCategory));
  console.log("holidayAllowanceEarned:", JSON.stringify(empData?.holidayAllowanceEarned));
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
