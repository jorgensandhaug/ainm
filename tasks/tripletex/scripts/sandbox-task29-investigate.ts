// Task 29 investigation: figure out what the scoring checks
// Using the "Cloud Migration Northwave" prompt as reference:
// - Create customer Northwave Ltd (932075482)
// - Create 2 employees: Samuel Brown (project manager, 74h), Sarah Lewis (consultant, 85h)
// - Project with budget 396900
// - Supplier cost 56750 from Clearwater Ltd (889264985)
// - Customer invoice for the project

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };
const TODAY = "2026-03-21";

// Unique suffix to avoid collisions with past sandbox runs
const SUFFIX = `T29-${Date.now()}`;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`\n${method} ${url}`);
  const opts: RequestInit = { method, headers: H };
  if (body) {
    opts.body = JSON.stringify(body);
    // Show body for debugging
    console.log("  Body:", JSON.stringify(body).slice(0, 500));
  }
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`  Status: ${r.status}`);
  if (!r.ok) {
    console.log(`  Error: ${text.slice(0, 500)}`);
    return { ok: false, status: r.status, error: text };
  }
  const parsed = JSON.parse(text);
  return { ok: true, status: r.status, data: parsed };
}

function splitHours(totalHours: number, startDate: string): { date: string; hours: number }[] {
  const entries: { date: string; hours: number }[] = [];
  let remaining = totalHours;
  const [y, m, d] = startDate.split("-").map(Number);
  let offset = 0;
  while (remaining > 0) {
    const chunk = Math.min(remaining, 7.5);
    const dt = new Date(Date.UTC(y, m - 1, d + offset));
    entries.push({ date: dt.toISOString().slice(0, 10), hours: chunk });
    remaining = +(remaining - chunk).toFixed(2);
    offset++;
  }
  return entries;
}

async function main() {
  console.log("=== TASK 29 SANDBOX INVESTIGATION ===");
  console.log("Goal: figure out what checks 3-7 verify\n");

  // Step 1: Prereqs
  const [deptR, divR] = await Promise.all([
    api("GET", "/department?isInactive=false&count=1&fields=*"),
    api("GET", "/division?count=1&fields=*"),
  ]);
  const deptId = deptR.data?.values?.[0]?.id;
  const divId = divR.data?.values?.[0]?.id;
  console.log(`\nDept: ${deptId}, Div: ${divId}`);

  // Step 2: Create customer
  const custR = await api("POST", "/customer", {
    name: `Northwave ${SUFFIX}`,
    organizationNumber: "932075482",
    isCustomer: true,
  });
  const customerId = custR.data?.value?.id;
  console.log(`Customer: ${customerId}`);

  // Step 3: Create employee 1 — Samuel Brown (project manager per prompt)
  const empBase = (fn: string, ln: string, email: string, dob: string) => ({
    firstName: fn, lastName: ln, email, dateOfBirth: dob, userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{ startDate: TODAY, ...(divId ? { division: { id: divId } } : {}) }],
  });

  const e1R = await api("POST", "/employee", empBase("Samuel", "Brown", `samuel.brown.${SUFFIX}@example.org`, "1985-06-15"));
  const samuelId = e1R.data?.value?.id;
  console.log(`Samuel Brown (emp1): ${samuelId}`);

  // Step 4: Create employee 2 — Sarah Lewis (consultant)
  const e2R = await api("POST", "/employee", empBase("Sarah", "Lewis", `sarah.lewis.${SUFFIX}@example.org`, "1990-03-22"));
  const sarahId = e2R.data?.value?.id;
  console.log(`Sarah Lewis (emp2): ${sarahId}`);

  // Step 5: Check assignable project managers
  const mgrR = await api("GET", "/employee?assignableProjectManagers=true&count=100&fields=*");
  console.log(`\nAssignable project managers:`);
  for (const m of mgrR.data?.values || []) {
    console.log(`  id=${m.id} name=${m.firstName} ${m.lastName} email=${m.email}`);
  }

  // KEY TEST: Can we use Samuel Brown (newly created, NO_ACCESS) as projectManager?
  console.log("\n=== TEST: Use Samuel Brown as project manager ===");
  const projR = await api("POST", "/project", {
    name: `Cloud Migration ${SUFFIX}`,
    startDate: TODAY,
    customer: { id: customerId },
    projectManager: { id: samuelId }, // <-- testing if this works
  });

  if (projR.ok) {
    console.log(`SUCCESS: Project created with Samuel as manager! Project ID: ${projR.data?.value?.id}`);
    const projectId = projR.data?.value?.id;

    // Read back the project to see what projectManager looks like
    const projRead = await api("GET", `/project/${projectId}?fields=*,projectManager(*)`);
    console.log(`\nProject read-back:`);
    console.log(`  projectManager: ${JSON.stringify(projRead.data?.value?.projectManager)}`);
    console.log(`  budget: ${projRead.data?.value?.budget}`);
    console.log(`  budgetFeeCurrency: ${projRead.data?.value?.budgetFeeCurrency}`);

    // Step 6: Create project activity with budget
    const actR = await api("POST", "/project/projectActivity", {
      project: { id: projectId },
      startDate: TODAY,
      budgetFeeCurrency: 396900,
      activity: {
        name: "Prosjektaktivitet",
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: false,
      },
    });
    const activityId = actR.data?.value?.activity?.id;
    console.log(`Activity: ${activityId}, budgetFee: ${actR.data?.value?.budgetFeeCurrency}`);

    // Read project again to see if budget changed
    const projRead2 = await api("GET", `/project/${projectId}?fields=*`);
    console.log(`\nProject after activity creation:`);
    console.log(`  budget: ${projRead2.data?.value?.budget}`);
    console.log(`  budgetFeeCurrency: ${projRead2.data?.value?.budgetFeeCurrency}`);

    // Step 7: Timesheet entries
    const samEntries = splitHours(74, TODAY);
    const sarahEntries = splitHours(85, TODAY);
    const timesheetPayload = [
      ...samEntries.map(e => ({ employee: { id: samuelId }, project: { id: projectId }, activity: { id: activityId }, date: e.date, hours: e.hours })),
      ...sarahEntries.map(e => ({ employee: { id: sarahId }, project: { id: projectId }, activity: { id: activityId }, date: e.date, hours: e.hours })),
    ];
    const tsR = await api("POST", "/timesheet/entry/list", timesheetPayload);
    console.log(`Timesheet: ${tsR.data?.values?.length} entries created`);

    // Step 8: Create supplier
    const supR = await api("POST", "/supplier", {
      name: `Clearwater ${SUFFIX}`,
      organizationNumber: "889264985",
      isSupplier: true,
    });
    const supplierId = supR.data?.value?.id;
    console.log(`Supplier: ${supplierId}`);

    // Step 9: Register supplier cost — TRY BOTH approaches
    // Approach A: POST /project/orderline (cheap, current approach)
    console.log("\n=== APPROACH A: project/orderline for supplier cost ===");
    const olR = await api("POST", "/project/orderline", {
      project: { id: projectId },
      description: `Supplier cost - Clearwater ${SUFFIX}`,
      date: TODAY,
      count: 1,
      unitCostCurrency: 56750,
      isChargeable: false,
    });
    console.log(`Orderline: ${olR.data?.value?.id}`);

    // Read back the project to see costs
    const projRead3 = await api("GET", `/project/${projectId}?fields=*`);
    console.log(`\nProject after cost orderline:`);
    const pv3 = projRead3.data?.value;
    console.log(`  budget: ${pv3?.budget}`);
    console.log(`  costCurrency: ${pv3?.costCurrency}`);
    console.log(`  feeCurrency: ${pv3?.feeCurrency}`);

    // Check what /project/orderline looks like on the project
    const olReadR = await api("GET", `/project/orderline?projectId=${projectId}&fields=*`);
    console.log(`\nProject orderlines:`);
    for (const ol of olReadR.data?.values || []) {
      console.log(`  id=${ol.id} desc="${ol.description}" cost=${ol.unitCostCurrency} vendor=${JSON.stringify(ol.vendor)}`);
    }

    // Step 10: Try creating a supplier invoice too to see the difference
    console.log("\n=== APPROACH B: supplierInvoice for supplier cost ===");
    // First find the vat type
    const vatR = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
    const vatId = vatR.data?.values?.[0]?.id;

    // Check incoming VAT for supplier invoice
    const vatInR = await api("GET", `/ledger/vatType?typeOfVat=INCOMING&vatDate=${TODAY}&fields=*`);
    console.log(`Incoming VAT types:`);
    for (const v of vatInR.data?.values || []) {
      console.log(`  id=${v.id} name=${v.name} percentage=${v.percentage}`);
    }
    const incomingVatId = vatInR.data?.values?.find((v: any) => v.percentage === 25)?.id || vatInR.data?.values?.[0]?.id;

    // Try POST /supplierInvoice
    const siR = await api("POST", "/supplierInvoice", {
      invoiceDate: TODAY,
      dueDate: "2026-04-20",
      supplier: { id: supplierId },
      invoiceNumber: `SI-${SUFFIX}`,
      orders: [{
        orderDate: TODAY,
        deliveryDate: TODAY,
        supplier: { id: supplierId },
        orderLines: [{
          description: `Supplier cost - Clearwater ${SUFFIX}`,
          count: 1,
          unitPriceExcludingVatCurrency: 56750,
          vatType: { id: incomingVatId },
        }],
      }],
    });
    if (siR.ok) {
      console.log(`Supplier invoice created: ${siR.data?.value?.id}`);
    } else {
      console.log(`Supplier invoice failed, trying simpler payload...`);
      // Try simpler payload
      const siR2 = await api("POST", "/supplierInvoice", {
        invoiceDate: TODAY,
        dueDate: "2026-04-20",
        supplier: { id: supplierId },
        invoiceNumber: `SI2-${SUFFIX}`,
      });
      console.log(`Simple supplier invoice: ${siR2.ok ? siR2.data?.value?.id : 'FAILED'}`);
    }

    // Step 11: Create customer invoice
    // Bank account check
    const bankR = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
    const bank = bankR.data?.values?.[0];
    if (bank && !bank.bankAccountNumber) {
      await api("PUT", `/ledger/account/${bank.id}`, {
        ...bank,
        bankAccountNumber: "12345678903",
      });
      console.log("Fixed bank account");
    }

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
          description: `Cloud Migration ${SUFFIX} - Project Services`,
          count: 1,
          unitPriceExcludingVatCurrency: 396900,
          vatType: { id: vatId },
        }],
      }],
    });
    if (invR.ok) {
      const inv = invR.data?.value;
      console.log(`\nInvoice created: ${inv?.id}`);
      console.log(`  invoiceNumber: ${inv?.invoiceNumber}`);
      console.log(`  amountExcludingVatCurrency: ${inv?.amountExcludingVatCurrency}`);
      console.log(`  projectInvoiceDetails: ${JSON.stringify(inv?.projectInvoiceDetails)}`);
    }

    // FINAL: Read back all created entities to see what fields exist
    console.log("\n\n=== FINAL STATE INSPECTION ===");

    // Project final state
    const projFinal = await api("GET", `/project/${projectId}?fields=*,projectManager(*),customer(*)`);
    const pf = projFinal.data?.value;
    console.log(`\nProject final state:`);
    console.log(`  name: ${pf?.name}`);
    console.log(`  projectManager: id=${pf?.projectManager?.id} name=${pf?.projectManager?.firstName} ${pf?.projectManager?.lastName}`);
    console.log(`  customer: id=${pf?.customer?.id} name=${pf?.customer?.name}`);
    console.log(`  budget: ${pf?.budget}`);
    console.log(`  budgetFeeCurrency: ${pf?.budgetFeeCurrency}`);
    console.log(`  costCurrency: ${pf?.costCurrency}`);
    console.log(`  feeCurrency: ${pf?.feeCurrency}`);
    console.log(`  startDate: ${pf?.startDate}`);

    // Timesheet summary
    const tsRead = await api("GET", `/timesheet/entry?projectId=${projectId}&count=1000&fields=*,employee(*)`);
    const tsByEmp: Record<string, number> = {};
    for (const e of tsRead.data?.values || []) {
      const key = `${e.employee?.firstName} ${e.employee?.lastName}`;
      tsByEmp[key] = (tsByEmp[key] || 0) + e.hours;
    }
    console.log(`\nTimesheet summary:`);
    for (const [name, hours] of Object.entries(tsByEmp)) {
      console.log(`  ${name}: ${hours} hours`);
    }

  } else {
    console.log(`FAILED: Cannot use Samuel as project manager`);
    console.log(`Error: ${JSON.stringify(projR.error).slice(0, 500)}`);

    // Try with generic manager + Samuel separately
    console.log("\n=== FALLBACK: Use generic manager, set Samuel separately ===");
    const genericMgr = mgrR.data?.values?.[0];
    if (genericMgr) {
      const projR2 = await api("POST", "/project", {
        name: `Cloud Migration ${SUFFIX}`,
        startDate: TODAY,
        customer: { id: customerId },
        projectManager: { id: genericMgr.id },
      });
      if (projR2.ok) {
        const projectId = projR2.data?.value?.id;
        console.log(`Project created with generic manager: ${projectId}`);

        // Can we PUT to change the manager to Samuel?
        const putR = await api("PUT", `/project/${projectId}`, {
          id: projectId,
          name: `Cloud Migration ${SUFFIX}`,
          startDate: TODAY,
          customer: { id: customerId },
          projectManager: { id: samuelId },
        });
        if (putR.ok) {
          console.log(`SUCCESS: Updated project manager to Samuel Brown!`);
        } else {
          console.log(`FAILED: Cannot update manager to Samuel`);
        }
      }
    }
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
