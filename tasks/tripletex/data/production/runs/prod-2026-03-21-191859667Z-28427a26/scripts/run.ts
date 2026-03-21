const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "SSiUYhSdS8iDhvS6KkSItrPZhKrD_JE59WiiFMw1Td8";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// Step 1: POST /employee
const empBody = {
  firstName: "Ingrid",
  lastName: "Johansen",
  dateOfBirth: "1995-11-09",
  email: "ingrid.johansen@example.org",
  userType: "STANDARD",
  employments: [{ startDate: "2026-01-13" }],
};

console.log("=== POST /employee ===");
const r1 = await fetch(`${BASE}/employee`, {
  method: "POST",
  headers: H,
  body: JSON.stringify(empBody),
});
const j1 = await r1.json();
console.log("Status:", r1.status);
console.log("Response:", JSON.stringify(j1, null, 2));

let employeeId: number | undefined;

if (r1.status === 201) {
  employeeId = j1.value?.id;
} else if (r1.status === 422) {
  // Check for department.id repair
  const valMsgs: any[] = j1.validationMessages || [];
  const needsDept = valMsgs.some((m: any) => m.field === "department.id");

  if (needsDept) {
    console.log("\n=== GET /department (repair) ===");
    const rd = await fetch(
      `${BASE}/department?isInactive=false&count=1&fields=*`,
      { headers: H }
    );
    const jd = await rd.json();
    console.log("Status:", rd.status);
    console.log("Response:", JSON.stringify(jd, null, 2));

    let deptId: number;
    if (jd.count > 0) {
      deptId = jd.values[0].id;
    } else {
      console.log("\n=== POST /department (create) ===");
      const rc = await fetch(`${BASE}/department`, {
        method: "POST",
        headers: H,
        body: JSON.stringify({ name: "Avdeling" }),
      });
      const jc = await rc.json();
      console.log("Status:", rc.status);
      console.log("Response:", JSON.stringify(jc, null, 2));
      deptId = jc.value.id;
    }

    // Retry POST /employee with department
    const empBody2 = { ...empBody, department: { id: deptId } };
    console.log("\n=== POST /employee (retry with dept) ===");
    const r2 = await fetch(`${BASE}/employee`, {
      method: "POST",
      headers: H,
      body: JSON.stringify(empBody2),
    });
    const j2 = await r2.json();
    console.log("Status:", r2.status);
    console.log("Response:", JSON.stringify(j2, null, 2));

    if (r2.status === 201) {
      employeeId = j2.value?.id;
    } else if (r2.status === 422) {
      // Check for division repair
      const valMsgs2: any[] = j2.validationMessages || [];
      const needsDiv = valMsgs2.some(
        (m: any) => m.field === "employments.division.id"
      );
      if (needsDiv) {
        console.log("\n=== GET /division (repair) ===");
        const rv = await fetch(`${BASE}/division?count=1&fields=*`, {
          headers: H,
        });
        const jv = await rv.json();
        console.log("Status:", rv.status);
        console.log("Response:", JSON.stringify(jv, null, 2));
        const divId = jv.values[0].id;

        const empBody3 = {
          ...empBody,
          department: { id: deptId },
          employments: [{ startDate: "2026-01-13", division: { id: divId } }],
        };
        console.log("\n=== POST /employee (retry with dept+div) ===");
        const r3 = await fetch(`${BASE}/employee`, {
          method: "POST",
          headers: H,
          body: JSON.stringify(empBody3),
        });
        const j3 = await r3.json();
        console.log("Status:", r3.status);
        console.log("Response:", JSON.stringify(j3, null, 2));
        employeeId = j3.value?.id;
      }
    }
  }
}

if (!employeeId) {
  console.error("FAILED: could not create employee");
  process.exit(1);
}

// Step 2: verify employment startDate
console.log("\n=== GET /employee/employment ===");
const re = await fetch(
  `${BASE}/employee/employment?employeeId=${employeeId}&fields=*`,
  { headers: H }
);
const je = await re.json();
console.log("Status:", re.status);
console.log("Response:", JSON.stringify(je, null, 2));
