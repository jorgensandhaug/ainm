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
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.error("  ERROR:", JSON.stringify(json).substring(0, 300));
  return { status: r.status, ok: r.ok, data: json };
}

async function apiMultipart(method: string, path: string, formData: FormData) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, {
    method,
    headers: { Authorization: AUTH },
    body: formData,
  });
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} (multipart) → ${r.status}`);
  if (!r.ok) console.error("  ERROR:", JSON.stringify(json).substring(0, 300));
  return { status: r.status, ok: r.ok, data: json };
}

async function main() {
  // Use existing employee from prior investigation
  // First, find our test employee
  const existing = await api("GET", "/employee?firstName=Sandbox&lastName=T21-Test&count=1&fields=id,firstName,lastName,employeeNumber,employments(id)");
  let empId: number;
  let employmentId: number;

  if (existing.ok && existing.data.values?.length > 0) {
    empId = existing.data.values[0].id;
    employmentId = existing.data.values[0].employments?.[0]?.id;
    console.log(`Using existing employee id=${empId}, employment=${employmentId}`);
  } else {
    console.log("Creating new test employee...");
    // Get division
    const divRes = await api("GET", "/division?count=1&fields=id");
    const divisionId = divRes.data.values?.[0]?.id;

    // Get/create department
    const deptRes = await api("GET", "/department?name=IT&isInactive=false&count=100&fields=id,name");
    let deptId: number;
    const match = deptRes.data.values?.find((d: any) => d.name === "IT");
    if (match) {
      deptId = match.id;
    } else {
      const newDept = await api("POST", "/department", { name: "IT" });
      deptId = newDept.data.value.id;
    }

    // Get municipality
    const salRes = await api("GET", "/salary/settings?fields=municipality");
    const munId = salRes.data.value?.municipality?.id;

    const empRes = await api("POST", "/employee?fields=*,employments(*,employmentDetails(*))", {
      firstName: "Check5",
      lastName: "Hypothesis-" + Date.now(),
      dateOfBirth: "1990-03-15",
      userType: "NO_ACCESS",
      department: { id: deptId },
      employments: [{
        startDate: "2026-06-01",
        ...(divisionId ? { division: { id: divisionId } } : {}),
        employmentDetails: [{
          date: "2026-06-01",
          employmentType: "ORDINARY",
          employmentForm: "PERMANENT",
          remunerationType: "MONTHLY_WAGE",
          workingHoursScheme: "NOT_SHIFT",
          percentageOfFullTimeEquivalent: 100,
          annualSalary: 560000,
          occupationCode: { id: 2610 },
          ...(munId ? { payrollTaxMunicipalityId: { id: munId } } : {}),
        }],
      }],
    });
    empId = empRes.data.value?.id ?? empRes.data.id;
    employmentId = empRes.data.value?.employments?.[0]?.id ?? empRes.data.employments?.[0]?.id;
    console.log(`Created employee id=${empId}, employment=${employmentId}`);

    // Standard time
    await api("POST", "/employee/standardTime", {
      employee: { id: empId },
      fromDate: "2026-06-01",
      hoursPerDay: 7.5,
    });
  }

  console.log("\n=== HYPOTHESIS 1: documentArchive (upload PDF) ===");
  // First check if there are already docs
  const docs = await api("GET", `/documentArchive/employee/${empId}?fields=*`);
  console.log("  Current documents:", JSON.stringify(docs.data));

  // Create a small PDF-like file for testing
  const pdfContent = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n0\n%%EOF";

  const formData = new FormData();
  const blob = new Blob([pdfContent], { type: "application/pdf" });
  formData.append("file", blob, "tilbudsbrev.pdf");

  const uploadRes = await apiMultipart("POST", `/documentArchive/employee/${empId}`, formData);
  console.log("  Upload response:", JSON.stringify(uploadRes.data, null, 2));

  // Verify documents after upload
  if (uploadRes.ok) {
    const docsAfter = await api("GET", `/documentArchive/employee/${empId}?fields=*`);
    console.log("  Documents after upload:", JSON.stringify(docsAfter.data, null, 2));
  }

  console.log("\n=== HYPOTHESIS 2: employeeNumber + employmentId via PUT ===");
  // Check if we can PUT to set these
  const currentEmp = await api("GET", `/employee/${empId}?fields=*,employments(*)`);
  const currentNum = currentEmp.data.value?.employeeNumber;
  const currentEmpId = currentEmp.data.value?.employments?.[0]?.employmentId;
  console.log(`  Current employeeNumber="${currentNum}", employmentId="${currentEmpId}"`);

  // Try setting employeeNumber if empty
  if (!currentNum || currentNum === "") {
    const nextNum = String(Date.now() % 10000);
    const putRes = await api("PUT", `/employee/${empId}`, {
      ...currentEmp.data.value,
      employeeNumber: nextNum,
    });
    console.log(`  PUT employeeNumber="${nextNum}" → ${putRes.status}`);
    if (putRes.ok) {
      console.log(`  After PUT: employeeNumber="${putRes.data.value?.employeeNumber}"`);
    }
  }

  console.log("\n=== HYPOTHESIS 3: Employee category ===");
  // Check if categories exist
  const cats = await api("GET", "/employee/category?count=100&fields=*");
  console.log("  Categories:", JSON.stringify(cats.data));

  console.log("\n=== HYPOTHESIS 4: hourlyCostAndRate ===");
  const hcr = await api("GET", `/employee/hourlyCostAndRate?employeeId=${empId}&fields=*`);
  console.log("  HourlyCostAndRate:", JSON.stringify(hcr.data));

  console.log("\n=== HYPOTHESIS 5: entitlement ===");
  const ent = await api("GET", `/employee/entitlement?employeeId=${empId}&fields=*`);
  console.log("  Entitlement:", JSON.stringify(ent.data));

  console.log("\n=== HYPOTHESIS 6: Check other documentArchive types ===");
  // See if there are other documentArchive endpoints in use
  const allDocArchive = await api("GET", `/documentArchive/employee/${empId}?fields=*`);
  console.log("  Archive contents:", JSON.stringify(allDocArchive.data, null, 2));

  console.log("\n=== HYPOTHESIS 7: nextOfKin ===");
  const nok = await api("GET", `/employee/nextOfKin?employeeId=${empId}&fields=*`);
  console.log("  NextOfKin:", JSON.stringify(nok.data));

  console.log("\n=== HYPOTHESIS 8: leaveOfAbsence types ===");
  const laTypes = await api("GET", "/employee/employment/leaveOfAbsenceType?count=100&fields=*");
  console.log("  LeaveOfAbsence types:", JSON.stringify(laTypes.data).substring(0, 500));

  console.log("\n=== HYPOTHESIS 9: All documentArchive endpoints ===");
  // Check all possible documentArchive object types
  for (const objType of ["account", "customer", "project", "product", "supplier", "prospect"]) {
    const res = await api("GET", `/documentArchive/${objType}/0?count=1&fields=id`);
    // Just to see which ones exist as endpoints
  }

  console.log("\n=== Done ===");
}

main().catch(e => { console.error(e); process.exit(1); });
