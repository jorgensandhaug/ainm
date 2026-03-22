const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "vuiCN8lH0F9ReIrW0cVfOnPiazmG-AAtDBbrcn8swwk";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: GET one active department
const deptRes = await fetch(
  `${BASE}/department?isInactive=false&count=1&fields=id`,
  { headers: H }
);
const deptData = await deptRes.json();
console.log("GET /department status:", deptRes.status);

let deptId: number | undefined;
if (deptRes.ok && deptData.count > 0) {
  deptId = deptData.values[0].id;
  console.log("Department id:", deptId);
} else {
  console.log("No active department found, creating one...");
  const createDeptRes = await fetch(`${BASE}/department`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ name: "Avdeling" }),
  });
  const createDeptData = await createDeptRes.json();
  console.log("POST /department status:", createDeptRes.status);
  if (!createDeptRes.ok) {
    console.error("Failed to create department:", JSON.stringify(createDeptData));
    process.exit(1);
  }
  deptId = createDeptData.value.id;
  console.log("Created department id:", deptId);
}

// Step 2: POST /employee with nested employment
const employeePayload = {
  firstName: "Bjørn",
  lastName: "Neset",
  dateOfBirth: "1996-02-21",
  email: "bjrn.neset@example.org",
  userType: "NO_ACCESS",
  department: { id: deptId },
  employments: [
    {
      startDate: "2026-06-16",
    },
  ],
};

const empRes = await fetch(`${BASE}/employee?fields=*,employments(*)`, {
  method: "POST",
  headers: H,
  body: JSON.stringify(employeePayload),
});
const empData = await empRes.json();
console.log("POST /employee status:", empRes.status);

if (empRes.ok) {
  console.log("Employee created:");
  console.log("  id:", empData.value.id);
  console.log("  firstName:", empData.value.firstName);
  console.log("  lastName:", empData.value.lastName);
  console.log("  dateOfBirth:", empData.value.dateOfBirth);
  console.log("  email:", empData.value.email);
  if (empData.value.employments?.length > 0) {
    console.log("  employment startDate:", empData.value.employments[0].startDate);
  }
} else if (empRes.status === 422) {
  // Check for division repair branch
  const msgs = empData.validationMessages || [];
  const divisionIssue = msgs.some((m: any) => m.field === "employments.division.id");
  console.log("422 validationMessages:", JSON.stringify(msgs));

  if (divisionIssue) {
    console.log("Division required — fetching one...");
    const divRes = await fetch(`${BASE}/division?count=1&fields=id`, { headers: H });
    const divData = await divRes.json();
    console.log("GET /division status:", divRes.status);

    if (divRes.ok && divData.count > 0) {
      const divId = divData.values[0].id;
      console.log("Division id:", divId);

      employeePayload.employments[0] = {
        startDate: "2026-06-16",
        division: { id: divId },
      } as any;

      const retryRes = await fetch(`${BASE}/employee?fields=*,employments(*)`, {
        method: "POST",
        headers: H,
        body: JSON.stringify(employeePayload),
      });
      const retryData = await retryRes.json();
      console.log("POST /employee retry status:", retryRes.status);

      if (retryRes.ok) {
        console.log("Employee created (after division repair):");
        console.log("  id:", retryData.value.id);
        console.log("  firstName:", retryData.value.firstName);
        console.log("  lastName:", retryData.value.lastName);
        console.log("  dateOfBirth:", retryData.value.dateOfBirth);
        console.log("  email:", retryData.value.email);
        if (retryData.value.employments?.length > 0) {
          console.log("  employment startDate:", retryData.value.employments[0].startDate);
        }
      } else {
        console.error("Retry failed:", JSON.stringify(retryData));
        process.exit(1);
      }
    } else {
      console.error("No division found:", JSON.stringify(divData));
      process.exit(1);
    }
  } else {
    console.error("Unhandled 422:", JSON.stringify(empData));
    process.exit(1);
  }
} else {
  console.error("POST /employee failed:", JSON.stringify(empData));
  process.exit(1);
}
