// Task 29 investigation part 6:
// Focus: what EXACTLY differs between our setup and what scoring expects?
//
// Key observations from production:
// - checks 1-2 pass consistently = customer + project creation is fine
// - checks 3-7 fail consistently = something structural, not random
//
// Hypotheses to test:
// A. Budget: we set budgetFeeCurrency on activity, but scoring may check project.budget or budgetHours
// B. Hours: maybe hours need to be linked to specific employee identities, not just IDs
// C. Supplier: orderline ≠ supplier invoice; scoring checks /supplierInvoice
// D. Invoice: projectInvoiceDetails links to wrong project (order's auto-project, not ours)
// E. Maybe the check is on employee firstName/lastName matching prompt exactly

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };
const TODAY = "2026-03-21";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  if (!r.ok) {
    console.log(`${method} ${path} → ${r.status}: ${text.slice(0, 300)}`);
    return { ok: false, status: r.status, error: text };
  }
  return { ok: true, status: r.status, data: JSON.parse(text) };
}

async function main() {
  // TEST D: Project ID mismatch in invoice
  // When we POST /invoice with orders[0].project.id = X,
  // Tripletex creates an internal Order object that may have its OWN project
  // Let's trace this carefully

  console.log("=== TEST D: Invoice project linkage ===\n");

  // Use an existing project from a previous test
  // Actually let's create a fresh minimal one
  const deptR = await api("GET", "/department?isInactive=false&count=1&fields=*");
  const deptId = deptR.data?.values?.[0]?.id;
  const divR = await api("GET", "/division?count=1&fields=*");
  const divId = divR.data?.values?.[0]?.id;
  const mgrR = await api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*");
  const mgrId = mgrR.data?.values?.[0]?.id;

  const custR = await api("POST", "/customer", { name: "LinkTest Customer", isCustomer: true });
  const customerId = custR.data?.value?.id;

  const projR = await api("POST", "/project", {
    name: "LinkTest Project",
    startDate: TODAY,
    customer: { id: customerId },
    projectManager: { id: mgrId },
  });
  const projectId = projR.data?.value?.id;
  console.log(`Created project: ${projectId}`);

  // Get VAT type
  const vatR = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
  const vatId = vatR.data?.values?.[0]?.id;

  // Create invoice
  const invR = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: "2026-04-20",
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      project: { id: projectId },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: "Test service",
        count: 1,
        unitPriceExcludingVatCurrency: 10000,
        vatType: { id: vatId },
      }],
    }],
  });
  const invoiceId = invR.data?.value?.id;
  console.log(`Created invoice: ${invoiceId}`);

  // Read back with full expansion
  const invRead = await api("GET", `/invoice/${invoiceId}?fields=*,orders(*,project(*),orderLines(*)),projectInvoiceDetails(*,project(*))`);
  const iv = invRead.data?.value;

  console.log(`\nInvoice projectInvoiceDetails:`);
  for (const d of iv?.projectInvoiceDetails || []) {
    console.log(`  project.id: ${d.project?.id} project.name: ${d.project?.name}`);
  }

  console.log(`\nInvoice orders:`);
  for (const o of iv?.orders || []) {
    console.log(`  order.id: ${o.id} order.project.id: ${o.project?.id} order.project.name: ${o.project?.name}`);
  }

  console.log(`\nOur original project ID: ${projectId}`);
  const detailProjId = iv?.projectInvoiceDetails?.[0]?.project?.id;
  const orderProjId = iv?.orders?.[0]?.project?.id;
  console.log(`projectInvoiceDetails project ID: ${detailProjId} (match: ${detailProjId === projectId})`);
  console.log(`orders[0] project ID: ${orderProjId} (match: ${orderProjId === projectId})`);

  // Read both projects to compare
  if (detailProjId && detailProjId !== projectId) {
    const p1 = await api("GET", `/project/${projectId}?fields=*`);
    const p2 = await api("GET", `/project/${detailProjId}?fields=*`);
    console.log(`\nOriginal project: name="${p1.data?.value?.name}" number="${p1.data?.value?.number}"`);
    console.log(`Details project:  name="${p2.data?.value?.name}" number="${p2.data?.value?.number}"`);
  }

  // TEST A: Set budget on the project itself
  console.log("\n\n=== TEST A: Project-level budget ===\n");

  // Check if there's a direct budget field on the project
  // From the earlier read, we saw no budget/budgetFeeCurrency on the project
  // Maybe it's set differently

  // Try PUT to add budget directly
  const projPut = await api("PUT", `/project/${projectId}`, {
    id: projectId,
    name: "LinkTest Project",
    startDate: TODAY,
    customer: { id: customerId },
    projectManager: { id: mgrId },
    budget: 100000,
  });
  console.log(`PUT project with budget: ${projPut.ok ? 'OK' : 'FAILED'}`);
  if (projPut.ok) {
    console.log(`  budget on response: ${projPut.data?.value?.budget}`);
  }

  // Check project settings endpoint
  const settingsR = await api("GET", `/project/settings?fields=*`);
  console.log(`\nProject settings: ${settingsR.ok ? JSON.stringify(settingsR.data?.value).slice(0, 500) : 'FAILED'}`);

  // Try budgetHours on POST /project
  console.log("\n--- Try creating project with budgetHours ---");
  const projR2 = await api("POST", "/project", {
    name: "BudgetTest Project",
    startDate: TODAY,
    customer: { id: customerId },
    projectManager: { id: mgrId },
    budgetHours: 159,
  });
  if (projR2.ok) {
    const p = projR2.data?.value;
    console.log(`  budgetHours: ${p?.budgetHours}`);
    console.log(`  budget: ${p?.budget}`);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
