// Test hypotheses about what might cause check failures
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const AUTH = "Basic " + btoa("0:eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9");
const h = { "Content-Type": "application/json", Authorization: AUTH };
const TODAY = new Date().toISOString().slice(0, 10);

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json().catch(() => r.text());
  console.log(`GET ${path} -> ${r.status}`);
  if (!r.ok) { console.log("ERROR:", JSON.stringify(b).slice(0, 500)); return null; }
  return b;
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json().catch(() => r.text());
  console.log(`POST ${path} -> ${r.status}`);
  if (!r.ok) { console.log("ERROR:", JSON.stringify(b).slice(0, 500)); return null; }
  return b;
}
async function put(path: string, body?: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const b = await r.json().catch(() => r.text());
  console.log(`PUT ${path} -> ${r.status}`);
  if (!r.ok) { console.log("ERROR:", JSON.stringify(b).slice(0, 500)); return null; }
  return b;
}

async function main() {
  // Test 1: Can we set fixedprice on a project WITHOUT isFixedPrice?
  console.log("=== TEST 1: fixedprice without isFixedPrice ===");
  const dept = await get("/department?isInactive=false&count=1&fields=id");
  const pm = await get("/employee?assignableProjectManagers=true&count=1&fields=id");
  const cust = await post("/customer", { name: `Hyp1-${Date.now()}`, organizationNumber: "851704027", isCustomer: true });

  const proj1 = await post("/project", {
    name: `Hypothesis1-${Date.now()}`,
    startDate: TODAY,
    customer: { id: cust?.value?.id },
    projectManager: { id: pm?.values?.[0]?.id },
    fixedprice: 418100,  // set fixedprice but NOT isFixedPrice
  });
  console.log("Project with fixedprice:", proj1?.value?.fixedprice, "isFixedPrice:", proj1?.value?.isFixedPrice);

  // Read back to see actual state
  if (proj1?.value?.id) {
    const p1Full = await get(`/project/${proj1.value.id}?fields=*`);
    console.log("Readback - fixedprice:", p1Full?.value?.fixedprice, "isFixedPrice:", p1Full?.value?.isFixedPrice);
  }

  // Test 2: Can we PUT fixedprice on an existing project without changing isFixedPrice?
  console.log("\n=== TEST 2: PUT fixedprice on existing project ===");
  const projects = await get(`/project?name=LifecycleTest&count=1&sorting=-id&fields=*`);
  const existingProj = projects?.values?.[0];
  if (existingProj) {
    console.log("Before PUT - fixedprice:", existingProj.fixedprice, "isFixedPrice:", existingProj.isFixedPrice);
    const updated = await put(`/project/${existingProj.id}`, {
      ...existingProj,
      fixedprice: 418100,
      // keep isFixedPrice as is (false)
    });
    const p2Full = await get(`/project/${existingProj.id}?fields=*`);
    console.log("After PUT - fixedprice:", p2Full?.value?.fixedprice, "isFixedPrice:", p2Full?.value?.isFixedPrice);

    // Check if hourly rates are still working
    const ts = await get(`/timesheet/entry?projectId=${existingProj.id}&dateFrom=${TODAY}&dateTo=2027-01-01&fields=hourlyRate,chargeable&count=3`);
    console.log("Timesheet entries after PUT:", ts?.values?.map((t: any) => ({ hourlyRate: t.hourlyRate, chargeable: t.chargeable })));
  }

  // Test 3: What if we set the project budget differently? Check project.budget fields
  console.log("\n=== TEST 3: Check project budget-related fields ===");
  if (existingProj) {
    // Check ALL project fields for budget-related data
    const pFull = await get(`/project/${existingProj.id}?fields=*`);
    const p = pFull?.value;
    if (p) {
      console.log("fixedprice:", p.fixedprice);
      console.log("isFixedPrice:", p.isFixedPrice);
      console.log("isPriceCeiling:", p.isPriceCeiling);
      console.log("priceCeilingAmount:", p.priceCeilingAmount);
      console.log("contributionMarginPercent:", p.contributionMarginPercent);
      console.log("invoiceReserveTotalAmountCurrency:", p.invoiceReserveTotalAmountCurrency);
      console.log("totalInvoicedOnAccountAmountAbsoluteCurrency:", p.totalInvoicedOnAccountAmountAbsoluteCurrency);
      console.log("markUpOrderLines:", p.markUpOrderLines);
      console.log("markUpFeesEarned:", p.markUpFeesEarned);
    }
  }

  // Test 4: Can we make a newly created employee an assignable project manager?
  console.log("\n=== TEST 4: Can new employee become PM? ===");
  const newEmp = await post("/employee", {
    firstName: "PMTest",
    lastName: "User",
    email: `pmtest-${Date.now()}@example.org`,
    dateOfBirth: "1988-01-01",
    userType: "STANDARD",  // Try STANDARD instead of NO_ACCESS
    department: { id: dept?.values?.[0]?.id },
  });
  console.log("New employee:", newEmp?.value?.id, "userType:", newEmp?.value?.userType);

  // Check if they're assignable PMs
  if (newEmp?.value?.id) {
    const pms = await get(`/employee?assignableProjectManagers=true&count=100&fields=id,firstName,lastName,email`);
    console.log("Assignable PMs:", pms?.values?.map((e: any) => `${e.firstName} ${e.lastName} (${e.email})`));
  }

  // Test 5: What fields does /supplierInvoice have? Does it have a project field?
  console.log("\n=== TEST 5: Supplier invoice fields ===");
  const siSchema = await get(`/supplierInvoice?count=1&sorting=-id&fields=*`);
  if (siSchema?.values?.[0]) {
    const si = siSchema.values[0];
    console.log("SI fields:", Object.keys(si).join(", "));
    // Check for project-related fields
    for (const [k, v] of Object.entries(si)) {
      if (k.toLowerCase().includes("project") || k.toLowerCase().includes("cost")) {
        console.log(`  ${k}:`, v);
      }
    }
  }
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
