const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.error("ERROR:", JSON.stringify(json, null, 2));
  return { status: r.status, ok: r.ok, data: json };
}

async function main() {
  // 1. Verify IT-KONSULENT occupation code lookup
  console.log("=== Verifying IT-KONSULENT occupation code ===");
  const occRes = await api("GET", "/employee/employment/occupationCode?nameNO=IT-konsulent&count=10&fields=id,nameNO,code");
  console.log("Results:", JSON.stringify(occRes.data?.values, null, 2));

  // 2. Get division for sandbox
  const divRes = await api("GET", "/division?count=1&fields=id");
  const divId = divRes.data?.values?.[0]?.id;
  console.log("Division ID:", divId);

  // 3. Create department
  const deptRes = await api("POST", "/department", { name: "IT-sandbox-verify" });
  const deptId = deptRes.data?.value?.id;
  console.log("Department ID:", deptId);

  // 4. Create employee with hardcoded IT-KONSULENT id 2610
  const empRes = await api("POST", "/employee", {
    firstName: "SandboxIT",
    lastName: "Verify",
    dateOfBirth: "1990-01-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [
      {
        startDate: "2026-05-24",
        ...(divId ? { division: { id: divId } } : {}),
        employmentDetails: [
          {
            date: "2026-05-24",
            employmentType: "ORDINARY",
            employmentForm: "PERMANENT",
            remunerationType: "MONTHLY_WAGE",
            workingHoursScheme: "NOT_SHIFT",
            percentageOfFullTimeEquivalent: 100,
            annualSalary: 560000,
            occupationCode: { id: 2610 },
          },
        ],
      },
    ],
  });
  const empId = empRes.data?.value?.id;
  console.log("Employee ID:", empId);

  if (!empRes.ok) {
    console.error("Employee creation failed, stopping.");
    return;
  }

  // 5. Create standard time
  const stRes = await api("POST", "/employee/standardTime", {
    employee: { id: empId },
    fromDate: "2026-05-24",
    hoursPerDay: 7.5,
  });
  console.log("Standard time result:", stRes.status);

  // 6. Readback employment details to verify occupation code persisted
  const employmentId = empRes.data?.value?.employments?.[0]?.id;
  console.log("Employment ID:", employmentId);
  if (employmentId) {
    const detailsRes = await api("GET", `/employee/employment/details?employmentId=${employmentId}&fields=*,occupationCode(*)`);
    console.log("Employment details readback:", JSON.stringify(detailsRes.data?.values, null, 2));
  }

  // 7. Readback standard time
  const stReadback = await api("GET", `/employee/standardTime?employeeId=${empId}&fields=*`);
  console.log("Standard time readback:", JSON.stringify(stReadback.data?.values, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
