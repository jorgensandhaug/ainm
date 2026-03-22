/**
 * Task 29 Round 6: Does isFixedPrice=true suppress hourly rates?
 * Experiment 16 (no fixedPrice) → hourlyRate=1500 on timesheet
 * Experiment 18 (isFixedPrice=true) → hourlyRate=0 on timesheet
 * Let's test both side by side.
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
const RUN_ID = Date.now().toString(36);
const h = { "Content-Type": "application/json", Authorization: AUTH };
const TODAY = new Date().toISOString().slice(0, 10);

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  return { ok: r.ok, status: r.status, data: await r.json() };
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  return { ok: r.ok, status: r.status, data: await r.json() };
}
async function put(path: string, body?: any) {
  const opts: any = { method: "PUT", headers: h };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  return { ok: r.ok, status: r.status, data: await r.json() };
}

async function testProject(label: string, isFixedPrice: boolean) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`TEST: ${label} (isFixedPrice=${isFixedPrice})`);
  console.log("=".repeat(70));

  const dept = await get("/department?isInactive=false&count=1&fields=*");
  const deptId = dept.data.values[0].id;
  const pm = await get("/employee?assignableProjectManagers=true&count=1&fields=*");
  const pmId = pm.data.values[0].id;

  const cust = await post("/customer", {
    name: `FP-${isFixedPrice}-${RUN_ID}`,
    organizationNumber: "999999985",
    isCustomer: true,
  });
  const custId = cust.data.value.id;

  const emp = await post("/employee", {
    firstName: `Emp${isFixedPrice ? "FP" : "NoFP"}`,
    lastName: RUN_ID,
    email: `emp.fp${isFixedPrice}.${RUN_ID}@example.org`,
    dateOfBirth: "1990-01-01",
    userType: "NO_ACCESS",
    department: { id: deptId },
  });
  const empId = emp.data.value.id;

  const projPayload: any = {
    name: `Project-FP${isFixedPrice}-${RUN_ID}`,
    startDate: TODAY,
    customer: { id: custId },
    projectManager: { id: pmId },
  };
  if (isFixedPrice) {
    projPayload.isFixedPrice = true;
    projPayload.fixedprice = 100000;
  }
  const proj = await post("/project", projPayload);
  const projId = proj.data.value.id;
  console.log(`  Project: ${projId} isFixedPrice=${proj.data.value.isFixedPrice} fixedprice=${proj.data.value.fixedprice}`);

  // Create CHARGEABLE activity
  const act = await post("/project/projectActivity", {
    project: { id: projId },
    startDate: TODAY,
    budgetHours: 10,
    budgetFeeCurrency: 100000,
    activity: {
      name: "Arbeid",
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: true,
    },
  });
  const actId = act.data.value.activity.id;
  console.log(`  Activity: ${actId} isChargeable=${act.data.value.activity.isChargeable}`);

  // Participant
  await post("/project/participant", {
    project: { id: projId },
    employee: { id: empId },
    adminAccess: false,
  });

  // Set up hourly rate
  const rh = await get(`/project/hourlyRates?projectId=${projId}&count=10&fields=*`);
  const holder = rh.data.values?.[0];
  if (holder) {
    await put(`/project/hourlyRates/${holder.id}`, {
      project: { id: projId },
      startDate: TODAY,
      hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
    });
    const rate = await post("/project/hourlyRates/projectSpecificRates", {
      projectHourlyRate: { id: holder.id },
      employee: { id: empId },
      activity: { id: actId },
      hourlyRate: 1500,
    });
    console.log(`  Rate created: ${rate.ok} hourlyRate=${rate.data.value?.hourlyRate}`);
  }

  // NOW register hours
  const ts = await post("/timesheet/entry", {
    employee: { id: empId },
    project: { id: projId },
    activity: { id: actId },
    date: TODAY,
    hours: 5,
  });
  console.log(`  Timesheet: hours=${ts.data.value?.hours} chargeable=${ts.data.value?.chargeable} hourlyRate=${ts.data.value?.hourlyRate}`);

  // Read back via GET to confirm
  const tsRead = await get(`/timesheet/entry/${ts.data.value.id}?fields=*`);
  console.log(`  Readback: chargeable=${tsRead.data.value?.chargeable} hourlyRate=${tsRead.data.value?.hourlyRate} chargeableHours=${tsRead.data.value?.chargeableHours} projectChargeableHours=${tsRead.data.value?.projectChargeableHours}`);

  return { projId, custId, empId };
}

async function main() {
  console.log(`\nSandbox T29 Round 6 — Run ID: ${RUN_ID}`);

  // Test A: Without isFixedPrice
  await testProject("No Fixed Price", false);

  // Test B: With isFixedPrice=true
  await testProject("Fixed Price", true);

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error("FATAL:", e.message, e.stack); process.exit(1); });
