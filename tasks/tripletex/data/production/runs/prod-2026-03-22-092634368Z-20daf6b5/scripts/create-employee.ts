const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "3Q08RY--Bv5e0ED-LTh_fLdQ9sppb5FcGkOSiUlk83c";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// Step 1: GET one active department
const deptRes = await fetch(`${BASE}/department?isInactive=false&count=1&fields=id`, { headers: H });
const deptData = await deptRes.json();
console.log("GET /department status:", deptRes.status);

let deptId: number;
if (deptData.count > 0) {
  deptId = deptData.values[0].id;
  console.log("Found department id:", deptId);
} else {
  // Create a minimal department
  const createDept = await fetch(`${BASE}/department`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ name: "General" }),
  });
  const newDept = await createDept.json();
  console.log("POST /department status:", createDept.status);
  deptId = newDept.value.id;
  console.log("Created department id:", deptId);
}

// Step 2: POST /employee with department at top level, employment with startDate only
const empPayload = {
  firstName: "Edward",
  lastName: "Harris",
  dateOfBirth: "1987-11-09",
  email: "edward.harris@example.org",
  userType: "NO_ACCESS",
  department: { id: deptId },
  employments: [
    {
      startDate: "2026-07-06",
    },
  ],
};

const empRes = await fetch(`${BASE}/employee?fields=*,employments(*)`, {
  method: "POST",
  headers: H,
  body: JSON.stringify(empPayload),
});
const empData = await empRes.json();
console.log("POST /employee status:", empRes.status);

if (empRes.status === 201) {
  console.log("Employee created:", empData.value.id);
  console.log("firstName:", empData.value.firstName);
  console.log("lastName:", empData.value.lastName);
  console.log("dateOfBirth:", empData.value.dateOfBirth);
  console.log("email:", empData.value.email);
  console.log("employments:", JSON.stringify(empData.value.employments, null, 2));
} else if (empRes.status === 422) {
  console.log("422 response:", JSON.stringify(empData, null, 2));
  // Check for division repair branch
  const msgs = empData.validationMessages || [];
  const needsDivision = msgs.some((m: any) => m.field === "employments.division.id");
  if (needsDivision) {
    console.log("Division required — fetching...");
    const divRes = await fetch(`${BASE}/division?count=1&fields=id`, { headers: H });
    const divData = await divRes.json();
    console.log("GET /division status:", divRes.status);
    const divId = divData.values[0].id;
    console.log("Division id:", divId);

    empPayload.employments[0] = { startDate: "2026-07-06", division: { id: divId } } as any;
    const retryRes = await fetch(`${BASE}/employee?fields=*,employments(*)`, {
      method: "POST",
      headers: H,
      body: JSON.stringify(empPayload),
    });
    const retryData = await retryRes.json();
    console.log("Retry POST /employee status:", retryRes.status);
    if (retryRes.status === 201) {
      console.log("Employee created:", retryData.value.id);
      console.log("firstName:", retryData.value.firstName);
      console.log("lastName:", retryData.value.lastName);
      console.log("dateOfBirth:", retryData.value.dateOfBirth);
      console.log("email:", retryData.value.email);
      console.log("employments:", JSON.stringify(retryData.value.employments, null, 2));
    } else {
      console.log("Retry failed:", JSON.stringify(retryData, null, 2));
    }
  } else {
    console.log("Unhandled 422 — not a division issue");
  }
} else {
  console.log("Unexpected status:", JSON.stringify(empData, null, 2));
}
