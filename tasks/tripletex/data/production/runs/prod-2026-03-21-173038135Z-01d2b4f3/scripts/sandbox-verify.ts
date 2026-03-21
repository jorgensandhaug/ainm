const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

const TS = Date.now();

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`\n${method} ${path} → ${r.status}`);
  if (!r.ok) console.log("ERROR:", JSON.stringify(json, null, 2));
  else if (typeof json === "object") console.log(JSON.stringify(json, null, 2));
  return { status: r.status, json, ok: r.ok };
}

async function main() {
  console.log("=== SANDBOX VERIFICATION: onboard-employee STYRK 3323, no standard worktime ===\n");

  // Step 1: parallel prereqs
  console.log("--- Step 1: Parallel prereqs (GET /division + POST /department) ---");
  const [divRes, deptRes] = await Promise.all([
    api("GET", "/division?count=1&fields=id"),
    api("POST", "/department", { name: `Lager Verify ${TS}` }),
  ]);

  const divisionId = divRes.json.count > 0 ? divRes.json.values[0].id : null;
  const departmentId = deptRes.json.value.id;
  console.log(`\nResolved: division=${divisionId}, department=${departmentId}`);

  // Step 2: POST /employee with all contract fields
  console.log("\n--- Step 2: POST /employee with full nested payload ---");
  const employeePayload: any = {
    firstName: "Camille",
    lastName: `Moreau Verify ${TS}`,
    dateOfBirth: "1984-01-12",
    nationalIdentityNumber: "12018486901",
    email: `camille.moreau.${TS}@example.org`,
    bankAccountNumber: "27925957246",
    userType: "NO_ACCESS",
    department: { id: departmentId },
    employments: [
      {
        startDate: "2026-04-23",
        ...(divisionId ? { division: { id: divisionId } } : {}),
        employmentDetails: [
          {
            date: "2026-04-23",
            employmentType: "ORDINARY",
            employmentForm: "PERMANENT",
            remunerationType: "MONTHLY_WAGE",
            workingHoursScheme: "NOT_SHIFT",
            percentageOfFullTimeEquivalent: 80,
            annualSalary: 860000,
            occupationCode: { id: 2503 },
          },
        ],
      },
    ],
  };
  const empRes = await api("POST", "/employee", employeePayload);
  if (!empRes.ok) {
    console.error("Employee create failed, aborting");
    process.exit(1);
  }
  const employeeId = empRes.json.value.id;
  console.log(`\nEmployee created: id=${employeeId}`);

  // Step 3: Readback verification
  console.log("\n--- Step 3: Readback verification ---");

  // Read employee details
  const empRead = await api("GET", `/employee/${employeeId}?fields=*`);
  console.log("\n--- Employee readback ---");
  if (empRead.ok) {
    const e = empRead.json.value;
    console.log(`firstName: ${e.firstName}`);
    console.log(`lastName: ${e.lastName}`);
    console.log(`dateOfBirth: ${e.dateOfBirth}`);
    console.log(`nationalIdentityNumber: ${e.nationalIdentityNumber}`);
    console.log(`email: ${e.email}`);
    console.log(`bankAccountNumber: ${e.bankAccountNumber}`);
    console.log(`department.id: ${e.department?.id}`);
    console.log(`department.name: ${e.department?.name}`);
  }

  // Read employment
  const emplRead = await api("GET", `/employee/employment?employeeId=${employeeId}&fields=*`);
  if (emplRead.ok && emplRead.json.count > 0) {
    const empl = emplRead.json.values[0];
    console.log(`\n--- Employment readback ---`);
    console.log(`employmentId: ${empl.id}`);
    console.log(`startDate: ${empl.startDate}`);
    console.log(`division.id: ${empl.division?.id}`);

    // Read employment details
    const detailsRead = await api("GET", `/employee/employment/details?employmentId=${empl.id}&fields=*,occupationCode(*)`);
    if (detailsRead.ok && detailsRead.json.count > 0) {
      const d = detailsRead.json.values[0];
      console.log(`\n--- Employment Details readback ---`);
      console.log(`employmentType: ${d.employmentType}`);
      console.log(`employmentForm: ${d.employmentForm}`);
      console.log(`remunerationType: ${d.remunerationType}`);
      console.log(`workingHoursScheme: ${d.workingHoursScheme}`);
      console.log(`percentageOfFullTimeEquivalent: ${d.percentageOfFullTimeEquivalent}`);
      console.log(`annualSalary: ${d.annualSalary}`);
      console.log(`occupationCode.id: ${d.occupationCode?.id}`);
      console.log(`occupationCode.code: ${d.occupationCode?.code}`);
      console.log(`occupationCode.nameNO: ${d.occupationCode?.nameNO}`);
    }
  }

  console.log("\n=== VERIFICATION COMPLETE ===");
}

main().catch((e) => { console.error(e); process.exit(1); });
