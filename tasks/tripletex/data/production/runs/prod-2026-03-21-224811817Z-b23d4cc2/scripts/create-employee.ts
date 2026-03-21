const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "trHnn2IWmWuUe0RYg2kFltWc5ov-y28mG6nh10HgIXM";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const employee = {
  firstName: "Torbjørn",
  lastName: "Neset",
  dateOfBirth: "1991-11-14",
  email: "torbjrn.neset@example.org",
  userType: "NO_ACCESS",
  employments: [{ startDate: "2026-02-11" }],
};

async function run() {
  // Attempt 1: POST without department
  let r = await fetch(`${BASE}/employee?fields=*,employments(*)`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(employee),
  });
  let body = await r.json();
  console.log("POST /employee →", r.status);

  if (r.status === 201) {
    console.log("Created:", JSON.stringify(body.value, null, 2));
    return;
  }

  // Check for department.id validation failure
  if (r.status === 422) {
    const msgs = body.validationMessages || [];
    const needsDept = msgs.some((m: any) => m.field === "department.id");
    const needsDiv = msgs.some((m: any) => m.field === "employments.division.id");

    if (needsDept) {
      console.log("Department required — resolving...");
      const dr = await fetch(`${BASE}/department?isInactive=false&count=1&fields=*`, { headers: H });
      const dBody = await dr.json();
      console.log("GET /department →", dr.status);

      let deptId: number;
      if (dBody.count > 0) {
        deptId = dBody.values[0].id;
        console.log("Found dept:", deptId);
      } else {
        console.log("No active dept — creating one...");
        const cr = await fetch(`${BASE}/department?fields=*`, {
          method: "POST",
          headers: H,
          body: JSON.stringify({ name: "Avdeling" }),
        });
        const cBody = await cr.json();
        console.log("POST /department →", cr.status);
        deptId = cBody.value.id;
      }

      (employee as any).department = { id: deptId };

      // Retry POST with department
      r = await fetch(`${BASE}/employee?fields=*,employments(*)`, {
        method: "POST",
        headers: H,
        body: JSON.stringify(employee),
      });
      body = await r.json();
      console.log("POST /employee (with dept) →", r.status);

      if (r.status === 201) {
        console.log("Created:", JSON.stringify(body.value, null, 2));
        return;
      }

      // Check if division is now needed
      if (r.status === 422) {
        const msgs2 = body.validationMessages || [];
        const needsDiv2 = msgs2.some((m: any) => m.field === "employments.division.id");
        if (needsDiv2) {
          console.log("Division required — resolving...");
          const divR = await fetch(`${BASE}/division?count=1&fields=*`, { headers: H });
          const divBody = await divR.json();
          console.log("GET /division →", divR.status);
          const divId = divBody.values[0].id;
          console.log("Found division:", divId);
          employee.employments[0] = { ...employee.employments[0], division: { id: divId } } as any;

          r = await fetch(`${BASE}/employee?fields=*,employments(*)`, {
            method: "POST",
            headers: H,
            body: JSON.stringify(employee),
          });
          body = await r.json();
          console.log("POST /employee (with dept+div) →", r.status);
          console.log("Created:", JSON.stringify(body.value, null, 2));
          return;
        }
      }
    }

    // Division needed without department issue
    if (needsDiv && !needsDept) {
      console.log("Division required — resolving...");
      const divR = await fetch(`${BASE}/division?count=1&fields=*`, { headers: H });
      const divBody = await divR.json();
      console.log("GET /division →", divR.status);
      const divId = divBody.values[0].id;
      employee.employments[0] = { ...employee.employments[0], division: { id: divId } } as any;

      r = await fetch(`${BASE}/employee?fields=*,employments(*)`, {
        method: "POST",
        headers: H,
        body: JSON.stringify(employee),
      });
      body = await r.json();
      console.log("POST /employee (with div) →", r.status);
      console.log("Created:", JSON.stringify(body.value, null, 2));
      return;
    }
  }

  console.log("Unexpected:", r.status, JSON.stringify(body, null, 2));
}

run();
