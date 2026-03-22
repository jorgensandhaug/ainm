const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "NCRQ54pk1wtlFktTjGbk1j_oKGhdViOZrRbj85JJI4U";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const HEADERS = { Authorization: AUTH, "Content-Type": "application/json" };

async function run() {
  // Step 1: GET one active department
  const deptRes = await fetch(
    `${BASE}/department?isInactive=false&count=1&fields=id`,
    { headers: HEADERS }
  );
  const deptData = await deptRes.json();
  console.log("GET /department status:", deptRes.status);
  console.log("GET /department body:", JSON.stringify(deptData, null, 2));

  let deptId: number;
  if (deptData.count > 0) {
    deptId = deptData.values[0].id;
  } else {
    // No active department — create one
    const createDeptRes = await fetch(`${BASE}/department`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ name: "Avdeling" }),
    });
    const createDeptData = await createDeptRes.json();
    console.log("POST /department status:", createDeptRes.status);
    console.log("POST /department body:", JSON.stringify(createDeptData, null, 2));
    deptId = createDeptData.value.id;
  }

  console.log("Using department id:", deptId);

  // Step 2: POST /employee with nested employment
  const employeePayload = {
    firstName: "André",
    lastName: "Almeida",
    dateOfBirth: "1992-05-30",
    email: "andre.almeida@example.org",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [
      {
        startDate: "2026-02-04",
      },
    ],
  };

  const empRes = await fetch(`${BASE}/employee?fields=*,employments(*)`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(employeePayload),
  });
  const empData = await empRes.json();
  console.log("POST /employee status:", empRes.status);
  console.log("POST /employee body:", JSON.stringify(empData, null, 2));

  if (empRes.status === 422) {
    // Check for division repair branch
    const msgs = empData.validationMessages || [];
    const needsDivision = msgs.some(
      (m: any) => m.field === "employments.division.id"
    );
    if (needsDivision) {
      console.log("Division required — fetching one division...");
      const divRes = await fetch(`${BASE}/division?count=1&fields=id`, {
        headers: HEADERS,
      });
      const divData = await divRes.json();
      console.log("GET /division status:", divRes.status);
      console.log("GET /division body:", JSON.stringify(divData, null, 2));

      const divId = divData.values[0].id;
      employeePayload.employments[0] = {
        ...employeePayload.employments[0],
        division: { id: divId },
      } as any;

      const retryRes = await fetch(`${BASE}/employee?fields=*,employments(*)`, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify(employeePayload),
      });
      const retryData = await retryRes.json();
      console.log("POST /employee retry status:", retryRes.status);
      console.log("POST /employee retry body:", JSON.stringify(retryData, null, 2));
    }
  }
}

run().catch(console.error);
