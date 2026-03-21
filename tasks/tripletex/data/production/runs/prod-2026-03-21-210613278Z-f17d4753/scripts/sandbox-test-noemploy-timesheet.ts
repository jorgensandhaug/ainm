// Test: can employees without employments[] register timesheet entries?
// And: can we use GET /ledger/account?number=1920,6590,2400 as a single combined read?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";
const RND = Math.floor(Math.random() * 100000);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Content-Type": "application/json", Authorization: AUTH },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (r.status >= 400) {
    console.log("ERROR:", JSON.stringify(json).slice(0, 500));
  }
  return { status: r.status, json };
}

async function main() {
  // Get dept (still needed)
  const deptRes = await api("GET", "/department?isInactive=false&count=1&fields=*");
  const deptId = deptRes.json.values[0].id;

  // Create customer
  const custRes = await api("POST", "/customer", {
    name: `TestNoEmpCust ${RND}`,
    isCustomer: true,
  });
  const customerId = custRes.json.value.id;

  // Create employee WITHOUT employments
  const empRes = await api("POST", "/employee", {
    firstName: "NoEmpTimesheet",
    lastName: `Test${RND}`,
    email: `noempts${RND}@example.org`,
    dateOfBirth: "1990-01-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
  });
  const empId = empRes.json.value.id;
  console.log("Employee (no employments) id:", empId);

  // Get PM
  const pmRes = await api("GET", "/employee?assignableProjectManagers=true&count=1&fields=id");
  const pmId = pmRes.json.values[0].id;

  // Create project
  const projRes = await api("POST", "/project", {
    name: `TestProject ${RND}`,
    startDate: TODAY,
    customer: { id: customerId },
    projectManager: { id: pmId },
  });
  const projectId = projRes.json.value.id;

  // Create project activity
  const paRes = await api("POST", "/project/projectActivity", {
    project: { id: projectId },
    startDate: TODAY,
    budgetFeeCurrency: 100000,
    activity: {
      name: "Prosjektaktivitet",
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: false,
    },
  });
  const activityId = paRes.json.value.activity.id;

  // Add participant
  await api("POST", "/project/participant", {
    project: { id: projectId },
    employee: { id: empId },
    adminAccess: false,
  });

  // Try timesheet entry for employee without employments
  const tsRes = await api("POST", "/timesheet/entry/list", [
    {
      employee: { id: empId },
      project: { id: projectId },
      activity: { id: activityId },
      date: TODAY,
      hours: 7.5,
    },
  ]);
  console.log("Timesheet for no-employments employee:", tsRes.status === 201 ? "SUCCESS" : "FAILED");
  if (tsRes.status === 201) {
    console.log("Hours registered:", tsRes.json.values[0].hours);
  }

  // Test combined account read for invoice flow
  console.log("\n=== Combined account read test ===");
  const accRes = await api("GET", "/ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber");
  const accounts = accRes.json.values;
  const acc1920 = accounts.find((a: any) => a.number === 1920);
  const acc6590 = accounts.find((a: any) => a.number === 6590);
  const acc2400 = accounts.find((a: any) => a.number === 2400);
  console.log("1920:", acc1920?.id, "bank:", acc1920?.isBankAccount, "bankAcctNum:", acc1920?.bankAccountNumber);
  console.log("6590:", acc6590?.id);
  console.log("2400:", acc2400?.id);

  if (acc1920 && acc6590 && acc2400) {
    console.log("Combined read provides all needed accounts in 1 call!");
  }
}

main().catch(e => console.error("FATAL:", e.message));
