const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "p4CFC8dY6dHMuoqeMVc89SOMbWI_zcs4qIVVcIPJwHQ";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const FIELDS = "fields=*,employments(*)";

const employeePayload = {
  firstName: "Astrid",
  lastName: "Nilsen",
  dateOfBirth: "1990-07-27",
  email: "astrid.nilsen@example.org",
  userType: "NO_ACCESS",
  employments: [{ startDate: "2026-07-11" }],
};

async function post(url: string, body: any) {
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await r.json();
  return { status: r.status, json };
}

async function get(url: string) {
  const r = await fetch(url, { headers: { Authorization: AUTH } });
  return r.json();
}

async function run() {
  // Attempt 1: POST /employee without department
  let res = await post(`${BASE}/employee?${FIELDS}`, employeePayload);
  console.log("POST /employee attempt 1:", res.status, JSON.stringify(res.json, null, 2));

  if (res.status === 201) {
    console.log("SUCCESS — 1 call");
    return;
  }

  // Check for department.id validation failure
  const msgs = res.json?.validationMessages || [];
  const needsDept = msgs.some((m: any) => m.field === "department.id");
  if (!needsDept) {
    console.log("UNEXPECTED 422 — not department.id related, stopping");
    return;
  }

  // Repair: GET active department
  const deptRes = await get(`${BASE}/department?isInactive=false&count=1&fields=*`);
  console.log("GET /department:", JSON.stringify(deptRes, null, 2));

  let deptId: number | undefined;
  if (deptRes.count > 0) {
    deptId = deptRes.values[0].id;
  } else {
    // No active department — create one
    const newDept = await post(`${BASE}/department?fields=*`, { name: "Avdeling" });
    console.log("POST /department:", newDept.status, JSON.stringify(newDept.json, null, 2));
    deptId = newDept.json?.value?.id;
  }

  if (!deptId) {
    console.log("FAILED to resolve department");
    return;
  }

  // Retry with department
  const payloadWithDept = { ...employeePayload, department: { id: deptId } };
  res = await post(`${BASE}/employee?${FIELDS}`, payloadWithDept);
  console.log("POST /employee attempt 2:", res.status, JSON.stringify(res.json, null, 2));

  if (res.status === 201) {
    console.log("SUCCESS — department repair branch");
    return;
  }

  // Check for division.id validation failure
  const msgs2 = res.json?.validationMessages || [];
  const needsDiv = msgs2.some((m: any) => m.field === "employments.division.id");
  if (!needsDiv) {
    console.log("UNEXPECTED 422 — not division.id related, stopping");
    return;
  }

  // Repair: GET division
  const divRes = await get(`${BASE}/division?count=1&fields=*`);
  console.log("GET /division:", JSON.stringify(divRes, null, 2));

  let divId: number | undefined;
  if (divRes.count > 0) {
    divId = divRes.values[0].id;
  }

  if (!divId) {
    console.log("FAILED to resolve division");
    return;
  }

  // Retry with division
  const payloadWithDiv = {
    ...payloadWithDept,
    employments: [{ startDate: "2026-07-11", division: { id: divId } }],
  };
  res = await post(`${BASE}/employee?${FIELDS}`, payloadWithDiv);
  console.log("POST /employee attempt 3:", res.status, JSON.stringify(res.json, null, 2));

  if (res.status === 201) {
    console.log("SUCCESS — division repair branch");
  } else {
    console.log("FAILED final attempt");
  }
}

run();
