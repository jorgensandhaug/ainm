// Deep investigation of Check 3 (project manager / config)
// and Check 4 (hours) for task 29

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";
const h = { "Content-Type": "application/json", Authorization: AUTH };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  return { ok: r.ok, status: r.status, data: b };
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  return { ok: r.ok, status: r.status, data: b };
}
async function putReq(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  return { ok: r.ok, status: r.status, data: b };
}

async function main() {
  // ========================================================
  // TEST 1: What userTypes exist?
  // ========================================================
  console.log("=== TEST 1: Available userTypes ===");
  const userTypes = ["NO_ACCESS", "STANDARD", "EXTENDED", "ADMINISTRATOR", "ACCOUNTING", "INVOICING", "INVOICING_ACCOUNTING", "OWNER"];
  for (const ut of userTypes) {
    const res = await post("/employee", {
      firstName: "Test", lastName: ut, email: `test-${ut.toLowerCase()}@example.org`,
      dateOfBirth: "1985-01-01", userType: ut, department: { id: 837842 },
    });
    console.log(`  ${ut}: ${res.ok ? "OK (id=" + res.data.value?.id + ")" : "FAIL " + res.status}`);

    if (res.ok) {
      // Try to create project with this employee as PM
      const projRes = await post("/project", {
        name: `PM Test ${ut}`,
        startDate: TODAY,
        customer: { id: 108468362 },
        projectManager: { id: res.data.value.id },
      });
      console.log(`    As PM: ${projRes.ok ? "OK (proj=" + projRes.data.value?.id + ")" : "FAIL"}`);
      if (!projRes.ok) {
        console.log(`    Error: ${JSON.stringify(projRes.data.validationMessages).slice(0, 200)}`);
      }
    }
  }

  // ========================================================
  // TEST 2: Can we grant project manager access after creation?
  // ========================================================
  console.log("\n=== TEST 2: Grant PM access via PUT ===");

  // Check if there's a way to update employee access
  const emp = await post("/employee", {
    firstName: "PMAccess", lastName: "Test", email: "pmaccess-test@example.org",
    dateOfBirth: "1985-01-01", userType: "NO_ACCESS", department: { id: 837842 },
  });
  if (emp.ok) {
    const empId = emp.data.value.id;

    // Try updating to a higher access level
    const putRes = await putReq(`/employee/${empId}`, {
      ...emp.data.value,
      userType: "STANDARD",
    });
    console.log("  PUT to STANDARD:", putRes.ok, putRes.status);

    if (putRes.ok) {
      // Now try as PM
      const projRes = await post("/project", {
        name: "PM After Upgrade",
        startDate: TODAY,
        customer: { id: 108468362 },
        projectManager: { id: empId },
      });
      console.log("  As PM after upgrade:", projRes.ok, projRes.status);
    }
  }

  // ========================================================
  // TEST 3: Check what fields scorer might read on project
  // ========================================================
  console.log("\n=== TEST 3: Project field exploration ===");

  // Use existing project 402048443 from test 90
  const projectId = 402048443;

  // Try various field expansions
  const fieldSets = [
    "id,name,projectManager(*),isFixedPrice,fixedprice",
    "id,name,customer(*),projectManager(*)",
    "id,name,projectActivities(budgetHours,budgetFeeCurrency),participants(employee(*),adminAccess)",
    "id,name,budget,totalBudget,budgetAmount",
  ];

  for (const fields of fieldSets) {
    const res = await get(`/project/${projectId}?fields=${fields}`);
    console.log(`  fields=${fields.slice(0, 50)}... → ${res.ok ? "OK" : "FAIL " + res.status}`);
    if (res.ok) {
      console.log(`    `, JSON.stringify(res.data.value, null, 2).slice(0, 500));
    }
  }

  // ========================================================
  // TEST 4: Check employment endpoints
  // ========================================================
  console.log("\n=== TEST 4: Employment creation ===");

  // Create an employee with an employment
  const empWithEmpl = await post("/employee", {
    firstName: "WithEmpl", lastName: "Test", email: "with-empl@example.org",
    dateOfBirth: "1985-01-01", userType: "NO_ACCESS", department: { id: 837842 },
  });
  if (empWithEmpl.ok) {
    const empId2 = empWithEmpl.data.value.id;

    // Add employment
    const divRes = await get("/division?count=1&fields=*");
    const divId = divRes.data.values?.[0]?.id;

    const emplRes = await post("/employee/employment", {
      employee: { id: empId2 },
      startDate: TODAY,
      ...(divId ? { division: { id: divId } } : {}),
    });
    console.log("  Employment:", emplRes.ok, emplRes.status);
    if (emplRes.ok) {
      console.log("  Employment data:", JSON.stringify(emplRes.data.value).slice(0, 300));
    } else {
      console.log("  Error:", JSON.stringify(emplRes.data).slice(0, 300));
    }

    // Try employment details
    const emplDetRes = await post("/employee/employment/details", {
      employment: { id: emplRes.data.value?.id },
      date: TODAY,
      paySlipGenerationType: "MANUAL",
    });
    console.log("  Employment details:", emplDetRes.ok, emplDetRes.status);
    if (!emplDetRes.ok) {
      console.log("  Error:", JSON.stringify(emplDetRes.data).slice(0, 300));
    }
  }

  // ========================================================
  // TEST 5: Check if employee created WITHOUT employment can have timesheet
  // ========================================================
  console.log("\n=== TEST 5: Timesheet without employment ===");

  // We know from test 90 that employees without employment CAN have timesheet entries
  // Let's verify the timesheet entries are readable
  const tsRes = await get(`/timesheet/entry?projectId=402048443&dateFrom=${TODAY}&dateTo=2026-06-30&fields=employee(firstName,lastName),hours,date&count=5`);
  console.log("  Timesheet entries (sample):");
  for (const te of (tsRes.data.values || []).slice(0, 3)) {
    console.log(`    ${te.employee?.firstName} ${te.employee?.lastName}: ${te.hours}h on ${te.date}`);
  }

  // ========================================================
  // TEST 6: Search for project by name
  // ========================================================
  console.log("\n=== TEST 6: Project search ===");
  const searchRes = await get(`/project?name=Cloud+Migration+Northwave+T90&fields=id,name,projectManager(firstName,lastName),isFixedPrice,fixedprice`);
  console.log("  Search result:", JSON.stringify(searchRes.data.values?.[0], null, 2));
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
