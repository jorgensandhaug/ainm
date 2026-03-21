const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "XPJ7NslaZi6qWjllRpGaUY938JrTk0J0_nQbXaLahVU";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  return { status: r.status, data: j };
}

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  const j = await r.json();
  return { status: r.status, data: j };
}

function employeePayload(deptId?: number, divId?: number) {
  const emp: any = {
    firstName: "Charles",
    lastName: "Walker",
    dateOfBirth: "1999-01-21",
    email: "charles.walker@example.org",
    userType: "NO_ACCESS",
    employments: [
      {
        startDate: "2026-12-23",
        ...(divId ? { division: { id: divId } } : {}),
      },
    ],
  };
  if (deptId) emp.department = { id: deptId };
  return emp;
}

async function run() {
  // Attempt 1: POST without department
  let res = await post("/employee?fields=*,employments(*)", employeePayload());
  console.log("POST /employee attempt 1:", res.status, JSON.stringify(res.data, null, 2));

  if (res.status === 201) return;

  // Check for department.id validation error
  if (res.status === 422) {
    const valMsgs = res.data?.validationMessages || [];
    const needsDept = valMsgs.some((m: any) => m.field === "department.id");
    const needsDiv = valMsgs.some((m: any) => m.field === "employments.division.id");

    if (needsDept) {
      // GET active department
      const deptRes = await get("/department?isInactive=false&count=1&fields=*");
      console.log("GET /department:", deptRes.status, JSON.stringify(deptRes.data, null, 2));
      let deptId: number | undefined;
      const depts = deptRes.data?.values || [];
      if (depts.length > 0) {
        deptId = depts[0].id;
      } else {
        // Create minimal department
        const newDept = await post("/department?fields=*", { name: "Department" });
        console.log("POST /department:", newDept.status, JSON.stringify(newDept.data, null, 2));
        deptId = newDept.data?.value?.id;
      }

      // Retry with department
      res = await post("/employee?fields=*,employments(*)", employeePayload(deptId));
      console.log("POST /employee attempt 2 (with dept):", res.status, JSON.stringify(res.data, null, 2));
      if (res.status === 201) return;

      // Check for division error on retry
      if (res.status === 422) {
        const valMsgs2 = res.data?.validationMessages || [];
        if (valMsgs2.some((m: any) => m.field === "employments.division.id")) {
          const divRes = await get("/division?count=1&fields=*");
          console.log("GET /division:", divRes.status, JSON.stringify(divRes.data, null, 2));
          const divs = divRes.data?.values || [];
          if (divs.length > 0) {
            res = await post("/employee?fields=*,employments(*)", employeePayload(deptId, divs[0].id));
            console.log("POST /employee attempt 3 (with dept+div):", res.status, JSON.stringify(res.data, null, 2));
          }
        }
      }
    } else if (needsDiv) {
      // Division needed without department issue
      const divRes = await get("/division?count=1&fields=*");
      console.log("GET /division:", divRes.status, JSON.stringify(divRes.data, null, 2));
      const divs = divRes.data?.values || [];
      if (divs.length > 0) {
        res = await post("/employee?fields=*,employments(*)", employeePayload(undefined, divs[0].id));
        console.log("POST /employee attempt 2 (with div):", res.status, JSON.stringify(res.data, null, 2));
      }
    }
  }
}

run();
