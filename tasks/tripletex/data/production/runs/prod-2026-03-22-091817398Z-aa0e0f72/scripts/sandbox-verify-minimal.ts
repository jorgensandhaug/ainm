const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(data, null, 2)); }
  return { status: r.status, data };
}

async function main() {
  const ts = Date.now();

  // Minimal 2-call path: GET department + POST employee
  console.log("=== Minimal 2-call path ===");

  // Call 1: GET department
  const deptRes = await api("GET", "/department?isInactive=false&count=1&fields=id");
  const deptId = deptRes.data.values[0].id;
  console.log("Department ID:", deptId);

  // Call 2: POST employee with ONLY startDate in employment (no extra fields)
  const empRes = await api("POST", "/employee?fields=*,employments(*)", {
    firstName: `Test${ts}`,
    lastName: "Minimal",
    dateOfBirth: "1996-02-21",
    email: `test${ts}@example.org`,
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [
      {
        startDate: "2026-06-16"
      }
    ]
  });

  if (empRes.status === 201) {
    const v = empRes.data.value;
    console.log("\nEmployee created:", v.id, v.firstName, v.lastName);
    console.log("DOB:", v.dateOfBirth);
    console.log("Email:", v.email);
    console.log("userType:", v.userType);
    console.log("department:", v.department?.id);
    console.log("Employment ID:", v.employments?.[0]?.id);
    console.log("Employment startDate:", v.employments?.[0]?.startDate);
    console.log("\nTotal calls: 2, errors: 0");
  } else if (empRes.status === 422) {
    // Sandbox may need division
    const msgs = empRes.data.validationMessages || [];
    const needsDiv = msgs.some((m: any) => m.field === "employments.division.id");
    if (needsDiv) {
      console.log("\nDivision required in sandbox — fetching...");
      const divRes = await api("GET", "/division?count=1&fields=id");
      const divId = divRes.data.values[0].id;
      const retry = await api("POST", "/employee?fields=*,employments(*)", {
        firstName: `Test${ts}`,
        lastName: "Minimal",
        dateOfBirth: "1996-02-21",
        email: `test${ts}@example.org`,
        userType: "NO_ACCESS",
        department: { id: deptId },
        employments: [
          {
            startDate: "2026-06-16",
            division: { id: divId }
          }
        ]
      });
      if (retry.status === 201) {
        const v = retry.data.value;
        console.log("\nEmployee created (with division):", v.id, v.firstName, v.lastName);
        console.log("Employment startDate:", v.employments?.[0]?.startDate);
        console.log("\nTotal calls: 4 (sandbox needs division), errors: 1");
      }
    }
  }

  // Also test that extra fields FAIL
  console.log("\n=== Verify extra employment fields cause 422 ===");
  const badRes = await api("POST", "/employee?fields=*,employments(*)", {
    firstName: `Bad${ts}`,
    lastName: "Extra",
    dateOfBirth: "1990-01-01",
    email: `bad${ts}@example.org`,
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [
      {
        startDate: "2026-06-16",
        employmentType: "ORDINARY"
      }
    ]
  });
  console.log("Extra fields result:", badRes.status, "— expected 422 code 16000");
}

main();
