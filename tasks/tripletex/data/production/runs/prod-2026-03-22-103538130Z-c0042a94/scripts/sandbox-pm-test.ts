const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const AUTH = "Basic " + btoa("0:eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9");
const h = { "Content-Type": "application/json", Authorization: AUTH };
const TODAY = new Date().toISOString().slice(0, 10);

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  if (!r.ok) { console.log(`GET ${path} → ${r.status}:`, JSON.stringify(b).slice(0, 300)); return null; }
  return b;
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) { console.log(`POST ${path} → ${r.status}:`, JSON.stringify(b).slice(0, 300)); return null; }
  return b;
}
async function put(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) { console.log(`PUT ${path} → ${r.status}:`, JSON.stringify(b).slice(0, 300)); return null; }
  return b;
}

async function main() {
  // Test 1: Can we PUT project to change projectManager to a non-assignable employee?
  const dept = await get("/department?isInactive=false&count=1&fields=id");
  const deptId = dept!.values[0].id;
  const pmAss = await get("/employee?assignableProjectManagers=true&count=1&fields=id");
  const pmId = pmAss!.values[0].id;

  const emp = await post("/employee", {
    firstName: "PMTest",
    lastName: "Candidate",
    email: "pmtest.candidate@example.org",
    dateOfBirth: "1988-01-01",
    userType: "NO_ACCESS",
    department: { id: deptId },
  });
  const empId = emp!.value.id;
  console.log("Created employee:", empId);

  const cust = await post("/customer", { name: "PMTest Customer", organizationNumber: "970096531", isCustomer: true });
  const custId = cust!.value.id;

  const proj = await post("/project", {
    name: "PMTest Project " + Date.now(),
    startDate: TODAY,
    customer: { id: custId },
    projectManager: { id: pmId },
    isFixedPrice: true,
    fixedprice: 100000,
  });
  const pId = proj!.value.id;
  console.log("Created project:", pId, "with PM:", pmId);

  // Try PUT to change PM
  console.log("\n=== ATTEMPT 1: PUT project with new PM ===");
  const projFull = await get(`/project/${pId}?fields=*`);
  const putResult = await put(`/project/${pId}`, {
    ...projFull!.value,
    projectManager: { id: empId },
  });
  if (putResult) {
    console.log("PUT succeeded! New PM:", putResult.value.projectManager);
  }

  // Verify
  const verify = await get(`/project/${pId}?fields=id,projectManager(id,firstName,lastName)`);
  console.log("Verify PM:", JSON.stringify(verify?.value?.projectManager));

  // Test 2: Try creating project directly with the non-assignable employee as PM
  console.log("\n=== ATTEMPT 2: POST project with non-assignable PM ===");
  const proj2 = await post("/project", {
    name: "PMTest Project2 " + Date.now(),
    startDate: TODAY,
    customer: { id: custId },
    projectManager: { id: empId },
    isFixedPrice: true,
    fixedprice: 100000,
  });
  if (proj2) {
    console.log("Project2 created! PM:", JSON.stringify(proj2.value.projectManager));
    const verify2 = await get(`/project/${proj2.value.id}?fields=id,projectManager(id,firstName,lastName)`);
    console.log("Verify2 PM:", JSON.stringify(verify2?.value?.projectManager));
  }

  // Test 3: Check what happens with invoice - does project link work?
  console.log("\n=== ATTEMPT 3: Check invoice structure ===");
  // Create order linked to project
  const vat = await get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=" + TODAY + "&fields=id&count=1");
  const vatId = vat!.values[0].id;
  const ord = await post("/order", {
    customer: { id: custId },
    project: { id: pId },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [{
      description: "Test",
      count: 1,
      unitPriceExcludingVatCurrency: 100000,
      vatType: { id: vatId },
    }],
  });
  if (ord) {
    const ordId = ord.value.id;
    console.log("Order created:", ordId);

    // Check if bank account exists
    const acct = await get("/ledger/account?number=1920&fields=id,bankAccountNumber");
    const a1920 = acct!.values[0];
    if (!a1920.bankAccountNumber) {
      console.log("Setting bank account number...");
      await put(`/ledger/account/${a1920.id}`, { ...a1920, bankAccountNumber: "12345678903" });
    }

    const inv = await put(`/order/${ordId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`, undefined as any);
    if (inv) {
      console.log("Invoice created:", inv.value.id);
      const invFull = await get(`/invoice/${inv.value.id}?fields=*`);
      console.log("Invoice project link:", JSON.stringify(invFull?.value?.projectInvoiceDetails, null, 2));
      console.log("Invoice orders:", JSON.stringify(invFull?.value?.orders, null, 2));
      console.log("Invoice isApproved:", invFull?.value?.isApproved);
    }
  }
}

main().catch(e => console.error("FATAL:", e.message));
