// Deep dive:
// 1. How to make employee assignable as project manager (allowInformationRegistration?)
// 2. Supplier invoice correct schema
// 3. What project fields the scoring checks

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };
const TODAY = "2026-03-21";
const SUFFIX = `T29c-${Date.now()}`;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`\n${method} ${url}`);
  const opts: RequestInit = { method, headers: H };
  if (body) {
    opts.body = JSON.stringify(body);
    console.log("  Body:", JSON.stringify(body).slice(0, 1000));
  }
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`  Status: ${r.status}`);
  if (!r.ok) {
    console.log(`  Error: ${text.slice(0, 800)}`);
    return { ok: false, status: r.status, error: text };
  }
  const parsed = JSON.parse(text);
  return { ok: true, status: r.status, data: parsed };
}

async function main() {
  const deptR = await api("GET", "/department?isInactive=false&count=1&fields=*");
  const deptId = deptR.data?.values?.[0]?.id;
  const divR = await api("GET", "/division?count=1&fields=*");
  const divId = divR.data?.values?.[0]?.id;

  // ============================================================
  // PART 1: Project manager — try allowInformationRegistration
  // ============================================================
  console.log("\n\n========== PART 1: PROJECT MANAGER ACCESS ==========");

  // The assignable manager has allowInformationRegistration=true
  // Maybe creating with allowInformationRegistration=true helps?
  const empR = await api("POST", "/employee", {
    firstName: "Samuel",
    lastName: `Brown-${SUFFIX}`,
    email: `samuel.${SUFFIX}@example.org`,
    dateOfBirth: "1985-06-15",
    userType: "NO_ACCESS",
    allowInformationRegistration: true,
    department: { id: deptId },
    employments: [{ startDate: TODAY, ...(divId ? { division: { id: divId } } : {}) }],
  });
  const samuelId = empR.data?.value?.id;
  console.log(`Samuel: ${samuelId}, allowInfoReg: ${empR.data?.value?.allowInformationRegistration}`);

  // Check assignable
  const checkR = await api("GET", `/employee?assignableProjectManagers=true&id=${samuelId}&fields=*`);
  console.log(`Assignable after allowInformationRegistration=true? ${checkR.data?.values?.length > 0}`);

  // Try with isProjectManager (even though it wasn't in the keys)
  // Maybe the read-only field is set via employeeCategory?

  // Check what the account owner's employee record looks like
  const mgrR = await api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*");
  const mgr = mgrR.data?.values?.[0];
  console.log(`\nAssignable manager details:`);
  console.log(`  employeeCategory: ${JSON.stringify(mgr?.employeeCategory)}`);
  console.log(`  employments: ${JSON.stringify(mgr?.employments)}`);

  // Maybe scoring just doesn't check projectManager identity?
  // Let's skip this and focus on the other hypotheses

  // ============================================================
  // PART 2: Supplier invoice correct schema
  // ============================================================
  console.log("\n\n========== PART 2: SUPPLIER INVOICE ==========");

  const supR = await api("POST", "/supplier", {
    name: `Clearwater-${SUFFIX}`,
    organizationNumber: "889264985",
    isSupplier: true,
  });
  const supplierId = supR.data?.value?.id;

  // Try with invoiceDueDate instead of dueDate
  const si1 = await api("POST", "/supplierInvoice", {
    invoiceDate: TODAY,
    invoiceDueDate: "2026-04-20",
    supplier: { id: supplierId },
    invoiceNumber: `SI-${SUFFIX}`,
    orders: [{
      orderDate: TODAY,
      deliveryDate: TODAY,
      supplier: { id: supplierId },
      orderLines: [{
        description: "Supplier cost test",
        count: 1,
        unitPriceExcludingVatCurrency: 56750,
        vatType: { id: 1 },
      }],
    }],
  });

  if (si1.ok) {
    console.log(`Supplier invoice created: ${JSON.stringify(si1.data?.value, null, 2).slice(0, 1000)}`);
  } else {
    // Try without orders, different field names
    console.log("\nTrying different structures...");

    // Try voucher approach
    const si2 = await api("POST", "/supplierInvoice", {
      invoiceDate: TODAY,
      invoiceDueDate: "2026-04-20",
      supplier: { id: supplierId },
      invoiceNumber: `SI2-${SUFFIX}`,
    });

    if (si2.ok) {
      console.log(`Basic supplier invoice created: ${si2.data?.value?.id}`);
      // Now add lines?
    }
  }

  // ============================================================
  // PART 3: Full lifecycle with generic manager - inspect final state
  // ============================================================
  console.log("\n\n========== PART 3: FULL LIFECYCLE ==========");

  const custR = await api("POST", "/customer", {
    name: `Northwave-${SUFFIX}`,
    organizationNumber: "932075482",
    isCustomer: true,
  });
  const customerId = custR.data?.value?.id;

  // Use generic assignable manager
  const mgrId = mgr?.id;

  const projR = await api("POST", "/project", {
    name: `Cloud Migration ${SUFFIX}`,
    startDate: TODAY,
    customer: { id: customerId },
    projectManager: { id: mgrId },
  });
  const projectId = projR.data?.value?.id;
  console.log(`Project: ${projectId}`);

  // Activity with budget
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
  console.log(`Activity: ${activityId}`);

  // Read project to see all budget/cost fields
  const projRead = await api("GET", `/project/${projectId}?fields=*`);
  const pv = projRead.data?.value;
  console.log("\nProject fields (all):");
  if (pv) {
    for (const [k, v] of Object.entries(pv).sort()) {
      if (v !== null && v !== undefined && v !== "" && v !== 0 && v !== false) {
        console.log(`  ${k}: ${JSON.stringify(v)}`);
      }
    }
  }

  // Read project activity to see budget fields
  const paRead = await api("GET", `/project/projectActivity?projectId=${projectId}&fields=*`);
  console.log("\nProject activity fields:");
  for (const pa of paRead.data?.values || []) {
    console.log(`  id=${pa.id} budgetFeeCurrency=${pa.budgetFeeCurrency} budgetHours=${pa.budgetHours}`);
    console.log(`  activity: ${JSON.stringify(pa.activity)}`);
  }

  // Timesheets
  function splitHours(totalHours: number, startDate: string) {
    const entries: any[] = [];
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

  const tsPayload = [
    ...splitHours(74, TODAY).map(e => ({ employee: { id: samuelId }, project: { id: projectId }, activity: { id: activityId }, date: e.date, hours: e.hours })),
    ...splitHours(85, TODAY).map(e => ({ employee: { id: empR.data?.value?.id === samuelId ? samuelId : samuelId }, project: { id: projectId }, activity: { id: activityId }, date: e.date, hours: e.hours })),
  ];

  // Need a second employee for Sarah
  const sarahR = await api("POST", "/employee", {
    firstName: "Sarah",
    lastName: `Lewis-${SUFFIX}`,
    email: `sarah.${SUFFIX}@example.org`,
    dateOfBirth: "1990-03-22",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{ startDate: TODAY, ...(divId ? { division: { id: divId } } : {}) }],
  });
  const sarahId = sarahR.data?.value?.id;

  const tsPayload2 = [
    ...splitHours(74, TODAY).map(e => ({ employee: { id: samuelId }, project: { id: projectId }, activity: { id: activityId }, date: e.date, hours: e.hours })),
    ...splitHours(85, TODAY).map(e => ({ employee: { id: sarahId }, project: { id: projectId }, activity: { id: activityId }, date: e.date, hours: e.hours })),
  ];
  const tsR = await api("POST", "/timesheet/entry/list", tsPayload2);
  console.log(`Timesheet: ${tsR.data?.values?.length} entries`);

  // Cost orderline
  const olR = await api("POST", "/project/orderline", {
    project: { id: projectId },
    description: `Supplier cost - Clearwater ${SUFFIX}`,
    date: TODAY,
    count: 1,
    unitCostCurrency: 56750,
    isChargeable: false,
  });
  console.log(`Cost orderline: ${olR.data?.value?.id}`);

  // Can we link the vendor on the orderline?
  console.log("\n--- Try orderline WITH vendor link ---");
  const olR2 = await api("POST", "/project/orderline", {
    project: { id: projectId },
    description: `Supplier cost linked - Clearwater ${SUFFIX}`,
    date: TODAY,
    count: 1,
    unitCostCurrency: 56750,
    isChargeable: false,
    vendor: { id: supplierId },
  });
  if (olR2.ok) {
    console.log(`Orderline with vendor: ${olR2.data?.value?.id}`);
    console.log(`  vendor on response: ${JSON.stringify(olR2.data?.value?.vendor)}`);
  }

  // Read back project with all cost fields
  const projFinal = await api("GET", `/project/${projectId}?fields=*,projectManager(*),customer(*)`);
  const pf = projFinal.data?.value;
  console.log("\n=== FINAL PROJECT STATE ===");
  if (pf) {
    const interesting = [
      "name", "projectManager", "customer", "budget", "budgetFeeCurrency",
      "costCurrency", "feeCurrency", "startDate", "projectCategory",
      "totalBudgetFeeCurrency", "totalBudgetHours", "totalRegisteredHours",
    ];
    for (const k of interesting) {
      console.log(`  ${k}: ${JSON.stringify((pf as any)[k])}`);
    }
  }

  // Read invoice creation without making one - just to see
  const vatR = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
  const vatId = vatR.data?.values?.[0]?.id;

  // Bank fix
  const bankR = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
  const bank = bankR.data?.values?.[0];

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
        description: `Cloud Migration ${SUFFIX}`,
        count: 1,
        unitPriceExcludingVatCurrency: 396900,
        vatType: { id: vatId },
      }],
    }],
  });

  if (invR.ok) {
    console.log(`\n=== INVOICE CREATED ===`);
    const inv = invR.data?.value;
    console.log(`  id: ${inv?.id}`);
    console.log(`  invoiceNumber: ${inv?.invoiceNumber}`);
    console.log(`  amountExcludingVatCurrency: ${inv?.amountExcludingVatCurrency}`);
    console.log(`  projectInvoiceDetails: ${JSON.stringify(inv?.projectInvoiceDetails)}`);

    // Read it back with full expansion
    const invRead = await api("GET", `/invoice/${inv?.id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))`);
    const ir = invRead.data?.value;
    console.log(`\n=== INVOICE READ-BACK ===`);
    console.log(`  customer: ${ir?.customer?.name}`);
    console.log(`  orderLines count: ${ir?.orderLines?.length}`);
    if (ir?.orderLines?.[0]) {
      const ol = ir.orderLines[0];
      console.log(`  orderLine[0]: desc="${ol.description}" price=${ol.unitPriceExcludingVatCurrency} vatPct=${ol.vatType?.percentage}`);
    }
    console.log(`  projectInvoiceDetails: ${JSON.stringify(ir?.projectInvoiceDetails)}`);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
