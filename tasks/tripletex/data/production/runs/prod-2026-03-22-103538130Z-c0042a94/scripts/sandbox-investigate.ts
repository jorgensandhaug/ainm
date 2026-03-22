const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const AUTH = "Basic " + btoa("0:eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9");
const h = { "Content-Type": "application/json", Authorization: AUTH };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  console.log(`GET ${path} → ${r.status}`);
  if (!r.ok) { console.log("  ERROR:", JSON.stringify(b).slice(0, 300)); return null; }
  return b;
}

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  console.log(`POST ${path} → ${r.status}`);
  if (!r.ok) { console.log("  ERROR:", JSON.stringify(b).slice(0, 300)); return null; }
  return b;
}

async function put(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  console.log(`PUT ${path} → ${r.status}`);
  if (!r.ok) { console.log("  ERROR:", JSON.stringify(b).slice(0, 300)); return null; }
  return b;
}

async function main() {
  const TODAY = new Date().toISOString().slice(0, 10);

  // 1. Check who can be project manager
  console.log("\n=== ASSIGNABLE PROJECT MANAGERS ===");
  const pms = await get("/employee?assignableProjectManagers=true&fields=id,firstName,lastName,email,userType&count=50");
  if (pms) console.log("Assignable PMs:", JSON.stringify(pms.values, null, 2));

  // 2. Check all employee userTypes
  console.log("\n=== ALL EMPLOYEES ===");
  const allEmps = await get("/employee?count=50&fields=id,firstName,lastName,email,userType");
  if (allEmps) console.log("All employees:", JSON.stringify(allEmps.values, null, 2));

  // 3. Try creating employee with STANDARD userType
  console.log("\n=== TRY STANDARD EMPLOYEE ===");
  const dept = await get("/department?isInactive=false&count=1&fields=id");
  const deptId = dept?.values?.[0]?.id;

  const stdEmp = await post("/employee", {
    firstName: "TestPM",
    lastName: "Manager",
    email: "testpm.manager@example.org",
    dateOfBirth: "1988-01-01",
    userType: "STANDARD",
    department: { id: deptId },
  });
  if (stdEmp) {
    console.log("Standard employee created:", JSON.stringify(stdEmp.value, null, 2));
    // Check if now assignable
    const pms2 = await get("/employee?assignableProjectManagers=true&fields=id,firstName,lastName,email,userType&count=50");
    if (pms2) console.log("Assignable PMs after standard:", pms2.values?.map((e: any) => `${e.firstName} ${e.lastName} (${e.userType})`));
  }

  // 4. Try creating employee with ADMINISTRATOR userType
  console.log("\n=== TRY ADMINISTRATOR EMPLOYEE ===");
  const adminEmp = await post("/employee", {
    firstName: "TestAdmin",
    lastName: "Leader",
    email: "testadmin.leader@example.org",
    dateOfBirth: "1990-01-01",
    userType: "ADMINISTRATOR",
    department: { id: deptId },
  });
  if (adminEmp) {
    console.log("Admin employee created:", JSON.stringify(adminEmp.value, null, 2));
    const pms3 = await get("/employee?assignableProjectManagers=true&fields=id,firstName,lastName,email,userType&count=50");
    if (pms3) console.log("Assignable PMs after admin:", pms3.values?.map((e: any) => `${e.firstName} ${e.lastName} (${e.userType})`));
  }

  // 5. Check company/salesModules
  console.log("\n=== SALES MODULES ===");
  const modules = await get("/company/salesmodules?count=100&fields=*");
  if (modules) {
    const projectModules = modules.values?.filter((m: any) =>
      m.name?.toLowerCase().includes("project") || m.name?.toLowerCase().includes("prosjekt")
    );
    console.log("Project-related modules:", JSON.stringify(projectModules, null, 2));
  }

  // 6. Check project categories
  console.log("\n=== PROJECT CATEGORIES ===");
  const cats = await get("/project/category?count=50&fields=*");
  if (cats) console.log("Categories:", JSON.stringify(cats.values, null, 2));

  // 7. Check if there's a way to set hourly rates on project
  console.log("\n=== PROJECT HOURLY RATES ===");
  const rates = await get("/project/hourlyRates?count=10&fields=*");
  if (rates) console.log("Hourly rates:", JSON.stringify(rates.values?.slice(0, 3), null, 2));

  // 8. Check project period types / settings
  console.log("\n=== PROJECT SETTINGS ===");
  const settings = await get("/project/settings?fields=*");
  if (settings) console.log("Project settings:", JSON.stringify(settings.value, null, 2));
}

main().catch(e => console.error("FATAL:", e.message));
