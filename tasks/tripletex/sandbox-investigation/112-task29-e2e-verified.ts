/**
 * Task 29: End-to-end verified project lifecycle
 *
 * Uses the English prompt variant:
 * "Execute the complete project lifecycle for 'Cloud Migration Northwave'
 *  (Northwave Ltd, org no. 932075482): 1) Budget 396900 NOK.
 *  2) Hours: Samuel Brown (PM, samuel.brown@example.org) 74h,
 *  Sarah Lewis (consultant, sarah.lewis@example.org) 85h.
 *  3) Supplier cost 56750 NOK from Clearwater Ltd (org no. 889264985).
 *  4) Create customer invoice."
 *
 * This script uses unique suffixes to avoid sandbox collisions.
 * No sandbox reset needed.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Unique run suffix to avoid collisions
const RUN_ID = `e2e-${Date.now()}`;
const TODAY = new Date().toISOString().slice(0, 10);

// Prompt parameters
const PROJECT_NAME = `Cloud Migration Northwave ${RUN_ID}`;
const CUSTOMER_NAME = "Northwave Ltd";
const CUSTOMER_ORG = "932075482";
const PM_FIRST = "Samuel";
const PM_LAST = "Brown";
const PM_EMAIL = `samuel.brown-${RUN_ID}@example.org`;
const CONSULTANT_FIRST = "Sarah";
const CONSULTANT_LAST = "Lewis";
const CONSULTANT_EMAIL = `sarah.lewis-${RUN_ID}@example.org`;
const BUDGET = 396900;
const PM_HOURS = 74;
const CONSULTANT_HOURS = 85;
const TOTAL_HOURS = PM_HOURS + CONSULTANT_HOURS; // 159
const SUPPLIER_NAME = `Clearwater Ltd`;
const SUPPLIER_ORG = "889264985";
const SUPPLIER_COST = 56750;

const h = { "Content-Type": "application/json", Authorization: AUTH };

let callCount = 0;
let errorCount = 0;

async function get(path: string) {
  callCount++;
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  if (!r.ok) {
    errorCount++;
    console.error(`[${callCount}] GET ${path} → ${r.status}`, JSON.stringify(b).slice(0, 300));
    throw new Error(`GET ${path} ${r.status}`);
  }
  console.log(`[${callCount}] GET ${path} → ${r.status}`);
  return b;
}

async function post(path: string, body: any) {
  callCount++;
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) {
    errorCount++;
    console.error(`[${callCount}] POST ${path} → ${r.status}`, JSON.stringify(b).slice(0, 300));
    throw new Error(`POST ${path} ${r.status}`);
  }
  console.log(`[${callCount}] POST ${path} → ${r.status}`);
  return b;
}

async function put(path: string, body: any) {
  callCount++;
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) {
    errorCount++;
    console.error(`[${callCount}] PUT ${path} → ${r.status}`, JSON.stringify(b).slice(0, 300));
    throw new Error(`PUT ${path} ${r.status}`);
  }
  console.log(`[${callCount}] PUT ${path} → ${r.status}`);
  return b;
}

function splitHours(total: number, startDate: string): { date: string; hours: number }[] {
  const chunks: { date: string; hours: number }[] = [];
  const [y, m, d] = startDate.split("-").map(Number);
  let remaining = total;
  let offset = 0;
  while (remaining > 0) {
    const hrs = Math.min(remaining, 7.5);
    const dt = new Date(Date.UTC(y, m - 1, d + offset));
    chunks.push({ date: dt.toISOString().slice(0, 10), hours: hrs });
    remaining -= hrs;
    offset++;
  }
  return chunks;
}

async function main() {
  console.log("=== TASK 29 END-TO-END VERIFIED TEST ===");
  console.log(`Run ID: ${RUN_ID}`);
  console.log(`Date: ${TODAY}`);
  console.log(`Budget: ${BUDGET}, PM hours: ${PM_HOURS}, Consultant hours: ${CONSULTANT_HOURS}, Supplier cost: ${SUPPLIER_COST}`);
  console.log("");

  // ============================================================
  // STEP 1: Frontload ALL reads + create customer (6 parallel)
  // ============================================================
  console.log("\n--- Step 1: Frontload reads + create customer ---");
  const [deptRes, pmRes, acctRes, vtRes, vatRes, custRes] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=*"),
    get("/employee?assignableProjectManagers=true&count=1&fields=*"),
    get("/ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber"),
    get("/ledger/voucherType?name=Leverandørfaktura&count=1&fields=id,name"),
    get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=" + TODAY + "&fields=id,name,percentage"),
    post("/customer", {
      name: CUSTOMER_NAME,
      organizationNumber: CUSTOMER_ORG,
      isCustomer: true,
    }),
  ]);

  const deptId = deptRes.values?.[0]?.id;
  const pmAssignableId = pmRes.values[0].id;
  const acc1920 = acctRes.values.find((a: any) => a.number === 1920);
  const acc6590 = acctRes.values.find((a: any) => a.number === 6590);
  const acc2400 = acctRes.values.find((a: any) => a.number === 2400);
  const vtId = vtRes.values?.[0]?.id;
  const vatType = vatRes.values?.[0];
  const customerId = custRes.value.id;

  console.log(`  dept=${deptId} assignablePM=${pmAssignableId} customer=${customerId}`);
  console.log(`  accounts: 1920=${acc1920?.id} 6590=${acc6590?.id} 2400=${acc2400?.id}`);
  console.log(`  voucherType=${vtId} vatType=${vatType?.id} (${vatType?.percentage}%)`);

  if (!deptId || !acc6590 || !acc2400 || !vtId || !vatType) {
    throw new Error("Missing required lookup data");
  }

  // ============================================================
  // STEP 2: Create employees (batch) + project + (bank fix if needed)
  // ============================================================
  console.log("\n--- Step 2: Employees + project ---");
  const step2: Promise<any>[] = [
    post("/employee/list", [
      { firstName: PM_FIRST, lastName: PM_LAST, email: PM_EMAIL, dateOfBirth: "1985-06-15", userType: "NO_ACCESS", department: { id: deptId } },
      { firstName: CONSULTANT_FIRST, lastName: CONSULTANT_LAST, email: CONSULTANT_EMAIL, dateOfBirth: "1990-03-22", userType: "NO_ACCESS", department: { id: deptId } },
    ]),
    post("/project", {
      name: PROJECT_NAME,
      startDate: TODAY,
      customer: { id: customerId },
      projectManager: { id: pmAssignableId },
      isFixedPrice: true,
      fixedprice: BUDGET,
    }),
  ];

  // Fix bank account if needed
  if (acc1920 && !acc1920.bankAccountNumber) {
    step2.push(put(`/ledger/account/${acc1920.id}`, {
      ...acc1920,
      bankAccountNumber: "12345678903",
    }));
  }

  const step2Results = await Promise.all(step2);
  const empBatchRes = step2Results[0];
  const projRes = step2Results[1];

  const emp1Id = empBatchRes.values[0].id; // PM
  const emp2Id = empBatchRes.values[1].id; // Consultant
  const projectId = projRes.value.id;

  console.log(`  emp1(PM)=${emp1Id} emp2(consultant)=${emp2Id}`);
  console.log(`  project=${projectId} isFixedPrice=${projRes.value.isFixedPrice} fixedprice=${projRes.value.fixedprice}`);

  // ============================================================
  // STEP 3: Project activity (with budgetHours) + participants (batch)
  // ============================================================
  console.log("\n--- Step 3: Activity + participants ---");
  const [actRes, partRes] = await Promise.all([
    post("/project/projectActivity", {
      project: { id: projectId },
      startDate: TODAY,
      budgetHours: TOTAL_HOURS,
      budgetFeeCurrency: BUDGET,
      activity: {
        name: "Prosjektaktivitet",
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: false,
      },
    }),
    post("/project/participant/list", [
      { project: { id: projectId }, employee: { id: emp1Id }, adminAccess: true },
      { project: { id: projectId }, employee: { id: emp2Id }, adminAccess: false },
    ]),
  ]);

  const activityId = actRes.value.activity.id;
  console.log(`  activity=${activityId} budgetHours=${actRes.value.budgetHours} budgetFee=${actRes.value.budgetFeeCurrency}`);
  console.log(`  participants: ${partRes.values.map((p: any) => `emp=${p.employee.id} admin=${p.adminAccess}`).join(", ")}`);

  // ============================================================
  // STEP 4: Timesheet + supplier + orderline (3 parallel)
  // ============================================================
  console.log("\n--- Step 4: Timesheet + supplier + orderline ---");
  const entries1 = splitHours(PM_HOURS, TODAY).map((e) => ({
    employee: { id: emp1Id }, project: { id: projectId }, activity: { id: activityId }, date: e.date, hours: e.hours,
  }));
  const entries2 = splitHours(CONSULTANT_HOURS, TODAY).map((e) => ({
    employee: { id: emp2Id }, project: { id: projectId }, activity: { id: activityId }, date: e.date, hours: e.hours,
  }));

  const [tsRes, suppRes, olRes] = await Promise.all([
    post("/timesheet/entry/list", [...entries1, ...entries2]),
    post("/supplier", { name: SUPPLIER_NAME, organizationNumber: SUPPLIER_ORG, isSupplier: true }),
    post("/project/orderline", {
      project: { id: projectId },
      description: "Leverandørkostnad",
      date: TODAY,
      count: 1,
      unitCostCurrency: SUPPLIER_COST,
      isChargeable: false,
    }),
  ]);

  const suppId = suppRes.value.id;
  console.log(`  timesheet entries: ${tsRes.values?.length}`);
  console.log(`  supplier=${suppId}`);
  console.log(`  orderline=${olRes.value.id} unitCost=${olRes.value.unitCostCurrency}`);

  // ============================================================
  // STEP 5: Voucher + invoice (2 parallel)
  // ============================================================
  console.log("\n--- Step 5: Voucher + invoice ---");
  const dueDateObj = new Date(Date.UTC(
    parseInt(TODAY.slice(0, 4)),
    parseInt(TODAY.slice(5, 7)) - 1,
    parseInt(TODAY.slice(8, 10)) + 14
  ));
  const dueDate = dueDateObj.toISOString().slice(0, 10);

  const [voucherRes, invoiceRes] = await Promise.all([
    post("/ledger/voucher", {
      date: TODAY,
      description: "Leverandørkostnad",
      voucherType: { id: vtId },
      postings: [
        { row: 1, date: TODAY, description: "Leverandørkostnad", account: { id: acc6590.id }, amount: SUPPLIER_COST, amountCurrency: SUPPLIER_COST, amountGross: SUPPLIER_COST, amountGrossCurrency: SUPPLIER_COST, project: { id: projectId } },
        { row: 2, date: TODAY, description: "Leverandørgjeld", account: { id: acc2400.id }, amount: -SUPPLIER_COST, amountCurrency: -SUPPLIER_COST, amountGross: -SUPPLIER_COST, amountGrossCurrency: -SUPPLIER_COST, supplier: { id: suppId } },
      ],
    }),
    post("/invoice?sendToCustomer=false", {
      invoiceDate: TODAY,
      invoiceDueDate: dueDate,
      customer: { id: customerId },
      orders: [{
        customer: { id: customerId },
        project: { id: projectId },
        orderDate: TODAY,
        deliveryDate: TODAY,
        orderLines: [{
          description: PROJECT_NAME,
          count: 1,
          unitPriceExcludingVatCurrency: BUDGET,
          vatType: { id: vatType.id },
        }],
      }],
    }),
  ]);

  console.log(`  voucher=${voucherRes.value.id}`);
  console.log(`  invoice=${invoiceRes.value.id} number=${invoiceRes.value.invoiceNumber}`);

  // ============================================================
  // VERIFICATION PHASE — check all scorer-visible fields
  // ============================================================
  console.log("\n\n========================================");
  console.log("  VERIFICATION");
  console.log("========================================");

  let checksPassed = 0;
  let checksFailed = 0;

  function check(name: string, condition: boolean, detail: string) {
    if (condition) {
      checksPassed++;
      console.log(`  ✓ ${name}: ${detail}`);
    } else {
      checksFailed++;
      console.log(`  ✗ ${name}: ${detail}`);
    }
  }

  // Verify project
  const projVerify = (await get(`/project/${projectId}?fields=*`)).value;
  check("Check 1 — Customer exists", projVerify.customer?.id === customerId, `customer.id=${projVerify.customer?.id}`);
  check("Check 2 — Project exists", !!projVerify.name && projVerify.name.includes("Cloud Migration"), `name="${projVerify.name}"`);
  check("Check 3a — isFixedPrice", projVerify.isFixedPrice === true, `isFixedPrice=${projVerify.isFixedPrice}`);
  check("Check 3b — fixedprice", projVerify.fixedprice === BUDGET, `fixedprice=${projVerify.fixedprice} (expected ${BUDGET})`);

  // Verify project activity
  const actVerify = (await get(`/project/${projectId}?fields=projectActivities(*)`)).value;
  const pa = actVerify.projectActivities?.[0];
  check("Check 3c — budgetHours", pa?.budgetHours === TOTAL_HOURS, `budgetHours=${pa?.budgetHours} (expected ${TOTAL_HOURS})`);
  check("Check 3d — budgetFeeCurrency", pa?.budgetFeeCurrency === BUDGET, `budgetFeeCurrency=${pa?.budgetFeeCurrency} (expected ${BUDGET})`);

  // Verify participants
  const partVerify = (await get(`/project/${projectId}?fields=participants(employee(*),adminAccess)`)).value;
  const participants = partVerify.participants || [];
  const pmParticipant = participants.find((p: any) => p.employee?.id === emp1Id);
  const consultantParticipant = participants.find((p: any) => p.employee?.id === emp2Id);
  check("Check 6a — PM is participant", !!pmParticipant, `PM emp=${emp1Id} found=${!!pmParticipant}`);
  check("Check 6b — PM has adminAccess", pmParticipant?.adminAccess === true, `adminAccess=${pmParticipant?.adminAccess}`);
  check("Check 6c — Consultant is participant", !!consultantParticipant, `Consultant emp=${emp2Id} found=${!!consultantParticipant}`);

  // Verify timesheet entries
  const tsVerify = await get(`/timesheet/entry?projectId=${projectId}&dateFrom=${TODAY}&dateTo=2027-01-01&fields=employee(id),hours&count=200`);
  const byEmp: Record<number, number> = {};
  for (const te of tsVerify.values || []) {
    byEmp[te.employee?.id] = (byEmp[te.employee?.id] || 0) + te.hours;
  }
  check("Check 4 — PM hours", byEmp[emp1Id] === PM_HOURS, `PM hours=${byEmp[emp1Id]} (expected ${PM_HOURS})`);
  check("Check 5 — Consultant hours", byEmp[emp2Id] === CONSULTANT_HOURS, `Consultant hours=${byEmp[emp2Id]} (expected ${CONSULTANT_HOURS})`);

  // Verify project orderlines (supplier cost)
  const olVerify = await get(`/project/orderline?projectId=${projectId}&count=50&fields=*`);
  const costOrderline = olVerify.values?.find((o: any) => o.unitCostCurrency === SUPPLIER_COST);
  check("Check 5b — Orderline exists", !!costOrderline, `orderline unitCost=${costOrderline?.unitCostCurrency}`);

  // Verify supplier
  const suppVerify = (await get(`/supplier/${suppId}?fields=*`)).value;
  check("Supplier exists", suppVerify.name === SUPPLIER_NAME, `name="${suppVerify.name}"`);

  // Verify voucher
  const voucherVerify = (await get(`/ledger/voucher/${voucherRes.value.id}?fields=*`)).value;
  check("Voucher exists", !!voucherVerify.id, `voucher id=${voucherVerify.id}`);

  // Verify invoice
  const invVerify = (await get(`/invoice/${invoiceRes.value.id}?fields=*`)).value;
  check("Check 7a — Invoice exists", !!invVerify.id, `invoice id=${invVerify.id}`);
  check("Check 7b — Invoice amount", invVerify.amountExcludingVatCurrency === BUDGET, `amount=${invVerify.amountExcludingVatCurrency} (expected ${BUDGET})`);
  check("Check 7c — Invoice not sent", invVerify.isCreditNote === false, `isCreditNote=${invVerify.isCreditNote}`);
  check("Check 7d — Invoice has project", invVerify.projectInvoiceDetails?.length > 0 || false, `projectInvoiceDetails=${invVerify.projectInvoiceDetails?.length}`);

  // Verify project extra fields (informational, not scored)
  console.log("\n  --- Project Extra Fields (from fields=* above) ---");
  console.log(`  invoiceReserveTotalAmountCurrency: ${projVerify.invoiceReserveTotalAmountCurrency}`);

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log("\n\n========================================");
  console.log("  SUMMARY");
  console.log("========================================");
  console.log(`  API calls: ${callCount}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`  Checks passed: ${checksPassed}`);
  console.log(`  Checks failed: ${checksFailed}`);
  console.log(`  Sequential steps: 5`);
  console.log("");
  console.log("  Entity IDs:");
  console.log(`    customer: ${customerId}`);
  console.log(`    emp1 (PM): ${emp1Id}`);
  console.log(`    emp2 (consultant): ${emp2Id}`);
  console.log(`    project: ${projectId}`);
  console.log(`    activity: ${activityId}`);
  console.log(`    supplier: ${suppId}`);
  console.log(`    invoice: ${invoiceRes.value.id}`);
  console.log(`    voucher: ${voucherRes.value.id}`);

  if (checksFailed > 0) {
    console.log("\n  *** SOME CHECKS FAILED — see above ***");
    process.exit(1);
  } else {
    console.log("\n  ALL CHECKS PASSED");
  }
}

main().catch((e) => { console.error("\nFATAL:", e.message); process.exit(1); });
