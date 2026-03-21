const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`, r.ok ? "" : JSON.stringify(json).slice(0, 300));
  return { ok: r.ok, status: r.status, data: json };
}

// First, get existing resources to test with
const [deptRes, pmRes] = await Promise.all([
  api("GET", "/department?isInactive=false&count=1&fields=*"),
  api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
]);

const deptId = deptRes.data.values[0].id;
const pmId = pmRes.data.values[0].id;

// Create a temporary customer and project
const custRes = await api("POST", "/customer", {
  name: "BatchParticipantTest AS",
  organizationNumber: "999999999",
});
const customerId = custRes.data.value.id;

// Create 2 test employees
const [emp1Res, emp2Res] = await Promise.all([
  api("POST", "/employee", {
    firstName: "BatchTest1",
    lastName: "Employee",
    email: "batchtest1@example.org",
    dateOfBirth: "1990-01-01",
    userType: "NO_ACCESS",
    department: { id: deptId },
  }),
  api("POST", "/employee", {
    firstName: "BatchTest2",
    lastName: "Employee",
    email: "batchtest2@example.org",
    dateOfBirth: "1990-02-02",
    userType: "NO_ACCESS",
    department: { id: deptId },
  }),
]);
const emp1Id = emp1Res.data.value.id;
const emp2Id = emp2Res.data.value.id;

// Create a project
const projRes = await api("POST", "/project", {
  name: "BatchParticipantTest Project",
  startDate: TODAY,
  customer: { id: customerId },
  projectManager: { id: pmId },
  isFixedPrice: true,
  fixedprice: 100000,
});
const projectId = projRes.data.value.id;

// TEST: batch POST /project/participant/list
console.log("\n=== Testing POST /project/participant/list (batch) ===");
const batchRes = await api("POST", "/project/participant/list", [
  {
    project: { id: projectId },
    employee: { id: emp1Id },
    adminAccess: true,
  },
  {
    project: { id: projectId },
    employee: { id: emp2Id },
    adminAccess: false,
  },
]);

if (batchRes.ok) {
  console.log("BATCH PARTICIPANTS WORKS!");
  console.log("Created:", batchRes.data.values?.length, "participants");
  console.log("Details:", JSON.stringify(batchRes.data.values?.map((v: any) => ({
    id: v.id,
    empId: v.employee?.id,
    adminAccess: v.adminAccess,
  }))));
} else {
  console.log("BATCH PARTICIPANTS FAILED — sticking with individual calls");
}
