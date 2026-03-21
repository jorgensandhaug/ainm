// Test: can timesheet entries be created for an employee who is NOT a project participant?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };
const TODAY = "2026-03-21";

async function get(p: string) {
  const r = await fetch(`${BASE}${p}`, { headers: H });
  const t = await r.text();
  if (!r.ok) throw new Error(`GET ${p} → ${r.status} ${t}`);
  return JSON.parse(t);
}
async function post(p: string, b: any) {
  const r = await fetch(`${BASE}${p}`, { method: "POST", headers: H, body: JSON.stringify(b) });
  const t = await r.text();
  console.log(`POST ${p} → ${r.status}`);
  if (!r.ok) console.log("  ERROR:", t);
  return { ok: r.ok, status: r.status, data: r.ok ? JSON.parse(t) : t };
}

async function main() {
  const uid = Date.now();

  // Get department and PM
  const [deptRes, pmRes] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=*"),
    get("/employee?assignableProjectManagers=true&count=1&fields=*"),
  ]);
  const deptId = deptRes.values[0].id;
  const pmId = pmRes.values[0].id;

  // Create customer
  const custRes = await post("/customer", { name: `Participant Test ${uid} AS`, organizationNumber: "999" + String(uid).slice(-6) });
  if (!custRes.ok) { console.log("FAILED to create customer"); return; }
  const custId = custRes.data.value.id;

  // Create employee (NO participant later)
  const empRes = await post("/employee", {
    firstName: "NoParticipant",
    lastName: `Test${uid}`,
    email: `nopart.${uid}@example.org`,
    dateOfBirth: "1990-05-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
  });
  if (!empRes.ok) { console.log("FAILED to create employee"); return; }
  const empId = empRes.data.value.id;

  // Create project
  const projRes = await post("/project", {
    name: `NoParticipant Project ${uid}`,
    startDate: TODAY,
    customer: { id: custId },
    projectManager: { id: pmId },
    isFixedPrice: true,
    fixedprice: 10000,
  });
  if (!projRes.ok) { console.log("FAILED to create project"); return; }
  const projId = projRes.data.value.id;

  // Create project activity
  const actRes = await post("/project/projectActivity", {
    project: { id: projId },
    startDate: TODAY,
    budgetHours: 10,
    budgetFeeCurrency: 10000,
    activity: {
      name: "TestActivity",
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: false,
    },
  });
  if (!actRes.ok) { console.log("FAILED to create activity"); return; }
  const activityId = actRes.data.value.activity.id;
  console.log("Created: cust=%d, emp=%d, proj=%d, act=%d", custId, empId, projId, activityId);

  // Try to register timesheet WITHOUT adding employee as participant
  console.log("\n--- TEST: timesheet entry WITHOUT participant ---");
  const tsRes = await post("/timesheet/entry/list", [
    { employee: { id: empId }, project: { id: projId }, activity: { id: activityId }, date: "2026-11-15", hours: 10 },
  ]);
  if (tsRes.ok) {
    console.log("SUCCESS: Timesheet created WITHOUT participant! entries=%d", tsRes.data.values.length);
    console.log("  hours=%d", tsRes.data.values[0].hours);
  } else {
    console.log("FAILED: Timesheet requires participant");
  }
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
