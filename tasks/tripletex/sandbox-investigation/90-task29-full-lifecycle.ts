// Task 29 Full Lifecycle Investigation (2026-03-22)
// RESULT: Full lifecycle with all 4 fixes runs successfully in sandbox.
// All scorer-visible fields verified correct.
// See test 93 for CORRECT vs BAD comparison confirming all 4 fixes matter.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";

const h = { "Content-Type": "application/json", Authorization: AUTH };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  if (!r.ok) { console.error("GET", path, r.status, JSON.stringify(b)); throw new Error(`GET ${path} ${r.status}`); }
  return b;
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) { console.error("POST", path, r.status, JSON.stringify(b)); throw new Error(`POST ${path} ${r.status}`); }
  return b;
}
async function put(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) { console.error("PUT", path, r.status, JSON.stringify(b)); throw new Error(`PUT ${path} ${r.status}`); }
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
  console.log("=== TASK 29 FULL LIFECYCLE TEST ===");
  console.log("Budget: 396900, PM hours: 74, Consultant hours: 85, Supplier cost: 56750");
  console.log("");

  // Step 1: Frontload reads + create customer
  const [deptRes, pmRes, acctRes, vtRes, vatRes] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=*"),
    get("/employee?assignableProjectManagers=true&count=1&fields=*"),
    get("/ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber"),
    get("/ledger/voucherType?name=Leverandørfaktura&count=1&fields=id,name"),
    get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=" + TODAY + "&fields=id,name,percentage"),
  ]);

  const deptId = deptRes.values?.[0]?.id;
  const pmAssignableId = pmRes.values[0].id;
  const pmAssignableName = pmRes.values[0].firstName + " " + pmRes.values[0].lastName;
  console.log("Department:", deptId);
  console.log("Assignable PM:", pmAssignableId, pmAssignableName);

  const acc1920 = acctRes.values.find((a: any) => a.number === 1920);
  const acc6590 = acctRes.values.find((a: any) => a.number === 6590);
  const acc2400 = acctRes.values.find((a: any) => a.number === 2400);
  console.log("Accounts: 1920=", acc1920?.id, " 6590=", acc6590?.id, " 2400=", acc2400?.id);

  const vtId = vtRes.values?.[0]?.id;
  console.log("VoucherType Leverandørfaktura:", vtId);

  // Find outgoing vatType (sandbox only has vatType 6 = 0%)
  const vatType = vatRes.values?.[0];
  console.log("VatType:", vatType?.id, "percentage:", vatType?.percentage);

  // Create customer
  const custRes = await post("/customer", {
    name: "Northwave Ltd",
    organizationNumber: "932075482",
    isCustomer: true,
  });
  const customerId = custRes.value.id;
  console.log("\nCustomer:", customerId, custRes.value.name);

  // Step 2: Create both employees (batch)
  const empBatchRes = await post("/employee/list", [
    { firstName: "Samuel", lastName: "Brown", email: "samuel.brown-t90@example.org", dateOfBirth: "1985-06-15", userType: "NO_ACCESS", department: { id: deptId } },
    { firstName: "Sarah", lastName: "Lewis", email: "sarah.lewis-t90@example.org", dateOfBirth: "1990-03-22", userType: "NO_ACCESS", department: { id: deptId } },
  ]);
  const emp1Id = empBatchRes.values[0].id; // Samuel (PM)
  const emp2Id = empBatchRes.values[1].id; // Sarah (consultant)
  console.log("\nEmployee 1 (PM):", emp1Id, empBatchRes.values[0].firstName, empBatchRes.values[0].lastName);
  console.log("Employee 2 (consultant):", emp2Id, empBatchRes.values[1].firstName, empBatchRes.values[1].lastName);

  // Step 3: Create project with isFixedPrice + fixedprice
  const projRes = await post("/project", {
    name: "Cloud Migration Northwave T90",
    startDate: TODAY,
    customer: { id: customerId },
    projectManager: { id: pmAssignableId },
    isFixedPrice: true,
    fixedprice: 396900,
  });
  const projectId = projRes.value.id;
  console.log("\nProject:", projectId, projRes.value.name);
  console.log("  isFixedPrice:", projRes.value.isFixedPrice);
  console.log("  fixedprice:", projRes.value.fixedprice);
  console.log("  projectManager.id:", projRes.value.projectManager?.id);

  // Step 4: Create project activity with budgetHours + participants
  const totalHours = 74 + 85; // 159
  const [actRes, partRes] = await Promise.all([
    post("/project/projectActivity", {
      project: { id: projectId },
      startDate: TODAY,
      budgetHours: totalHours,
      budgetFeeCurrency: 396900,
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
  console.log("\nActivity:", activityId, "budgetHours:", actRes.value.budgetHours, "budgetFee:", actRes.value.budgetFeeCurrency);
  console.log("Participants:", partRes.values.map((p: any) => `emp=${p.employee.id} admin=${p.adminAccess}`).join(", "));

  // Step 5: Timesheet entries + supplier + project orderline
  const entries1 = splitHours(74, TODAY).map((e) => ({
    employee: { id: emp1Id }, project: { id: projectId }, activity: { id: activityId }, date: e.date, hours: e.hours,
  }));
  const entries2 = splitHours(85, TODAY).map((e) => ({
    employee: { id: emp2Id }, project: { id: projectId }, activity: { id: activityId }, date: e.date, hours: e.hours,
  }));

  const [tsRes, suppRes, olRes] = await Promise.all([
    post("/timesheet/entry/list", [...entries1, ...entries2]),
    post("/supplier", { name: "Clearwater Ltd", organizationNumber: "889264985", isSupplier: true }),
    post("/project/orderline", {
      project: { id: projectId },
      description: "Leverandørkostnad",
      date: TODAY,
      count: 1,
      unitCostCurrency: 56750,
      isChargeable: false,
    }),
  ]);
  const suppId = suppRes.value.id;
  console.log("\nTimesheet entries created:", tsRes.values?.length);
  console.log("Supplier:", suppId, suppRes.value.name);
  console.log("Orderline:", olRes.value.id, "unitCost:", olRes.value.unitCostCurrency);

  // Step 6: Voucher + Invoice
  const dueDate = new Date(Date.UTC(2026, 2, 22 + 14)).toISOString().slice(0, 10);
  const [voucherRes, invoiceRes] = await Promise.all([
    post("/ledger/voucher", {
      date: TODAY,
      description: "Leverandørkostnad",
      voucherType: { id: vtId },
      postings: [
        { row: 1, date: TODAY, description: "Leverandørkostnad", account: { id: acc6590.id }, amount: 56750, amountCurrency: 56750, amountGross: 56750, amountGrossCurrency: 56750, project: { id: projectId } },
        { row: 2, date: TODAY, description: "Leverandørgjeld", account: { id: acc2400.id }, amount: -56750, amountCurrency: -56750, amountGross: -56750, amountGrossCurrency: -56750, supplier: { id: suppId } },
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
          description: "Cloud Migration Northwave T90",
          count: 1,
          unitPriceExcludingVatCurrency: 396900,
          vatType: { id: vatType.id },
        }],
      }],
    }),
  ]);
  console.log("\nVoucher:", voucherRes.value.id);
  console.log("Invoice:", invoiceRes.value.id, "number:", invoiceRes.value.invoiceNumber);
  console.log("  amountExcludingVat:", invoiceRes.value.amountExcludingVatCurrency);
  console.log("  amountIncludingVat:", invoiceRes.value.amountIncludingVatCurrency);

  // === VERIFICATION PHASE ===
  console.log("\n=== VERIFICATION ===");

  // Verify project with all fields
  const projVerify = await get(`/project/${projectId}?fields=*`);
  const p = projVerify.value;
  console.log("\n--- Project ---");
  console.log("  name:", p.name);
  console.log("  isFixedPrice:", p.isFixedPrice);
  console.log("  fixedprice:", p.fixedprice);
  console.log("  projectManager.id:", p.projectManager?.id);
  // Get PM details
  const pmVerify = await get(`/employee/${p.projectManager?.id}?fields=id,firstName,lastName,email`);
  console.log("  projectManager:", pmVerify.value?.firstName, pmVerify.value?.lastName, pmVerify.value?.email);
  console.log("  customer.id:", p.customer?.id);
  console.log("  startDate:", p.startDate);
  console.log("  budget:", p.budget);
  console.log("  invoiceReserveTotalAmountCurrency:", p.invoiceReserveTotalAmountCurrency);

  // Verify project activities via project expansion
  const actVerify = await get(`/project/${projectId}?fields=projectActivities(*)`);
  console.log("\n--- Project Activities ---");
  for (const a of actVerify.value.projectActivities || []) {
    console.log("  activity:", a.activity?.id);
    console.log("  budgetHours:", a.budgetHours);
    console.log("  budgetFeeCurrency:", a.budgetFeeCurrency);
  }

  // Verify participants via project expansion
  const partVerify = await get(`/project/${projectId}?fields=participants(employee(*),adminAccess)`);
  console.log("\n--- Participants ---");
  for (const pp of partVerify.value.participants || []) {
    console.log("  employee:", pp.employee?.id, pp.employee?.firstName, pp.employee?.lastName, "adminAccess:", pp.adminAccess);
  }

  // Verify timesheet entries (require dateFrom/dateTo)
  const tsVerify = await get(`/timesheet/entry?projectId=${projectId}&dateFrom=${TODAY}&dateTo=2026-06-30&fields=*&count=100`);
  console.log("\n--- Timesheet Entries ---");
  const byEmployee: Record<number, number> = {};
  for (const te of tsVerify.values || []) {
    byEmployee[te.employee?.id] = (byEmployee[te.employee?.id] || 0) + te.hours;
  }
  console.log("  Total entries:", tsVerify.values?.length);
  for (const [empId, hours] of Object.entries(byEmployee)) {
    console.log(`  Employee ${empId}: ${hours} hours`);
  }

  // Verify project orderlines
  const olVerify = await get(`/project/orderline?projectId=${projectId}&count=50&fields=*`);
  console.log("\n--- Project Orderlines ---");
  for (const ol of olVerify.values || []) {
    console.log("  id:", ol.id, "desc:", ol.description, "unitCost:", ol.unitCostCurrency, "count:", ol.count);
    console.log("  supplier:", ol.supplier?.id, ol.supplier?.name);
    console.log("  vendor:", ol.vendor);
  }

  // Verify supplier
  const suppVerify = await get(`/supplier/${suppId}?fields=*`);
  console.log("\n--- Supplier ---");
  console.log("  id:", suppVerify.value.id, "name:", suppVerify.value.name);

  // Verify voucher postings
  const voucherVerify = await get(`/ledger/voucher/${voucherRes.value.id}?fields=*`);
  console.log("\n--- Voucher ---");
  console.log("  id:", voucherVerify.value.id, "description:", voucherVerify.value.description);

  // Verify invoice with full details
  const invVerify = await get(`/invoice/${invoiceRes.value.id}?fields=*`);
  console.log("\n--- Invoice ---");
  const inv = invVerify.value;
  console.log("  id:", inv.id, "number:", inv.invoiceNumber);
  console.log("  amountExcludingVat:", inv.amountExcludingVatCurrency);
  console.log("  amountIncludingVat:", inv.amountIncludingVatCurrency);
  console.log("  customer.id:", inv.customer?.id);
  console.log("  isCreditNote:", inv.isCreditNote);
  console.log("  projectInvoiceDetails:", JSON.stringify(inv.projectInvoiceDetails));

  // Check invoice details
  if (inv.projectInvoiceDetails?.length) {
    for (const d of inv.projectInvoiceDetails) {
      const detail = await get(`/invoice/details/${d.id}?fields=*`);
      console.log("\n--- Invoice Detail ---");
      console.log("  ", JSON.stringify(detail.value, null, 2));
    }
  }

  // Check orders via date range
  const ordersVerify = await get(`/order?orderDateFrom=${TODAY}&orderDateTo=2026-12-31&fields=*,orderLines(*)&count=50`);
  console.log("\n--- Recent Orders ---");
  for (const o of ordersVerify.values || []) {
    if (o.project?.id === projectId) {
      console.log("  order:", o.id, "project:", o.project?.id);
      console.log("  orderLines:", JSON.stringify(o.orderLines, null, 2));
    }
  }

  // Check project overallStatus
  console.log("\n--- Project Overall Status ---");
  const overallRes = await get(`/project/${projectId}?fields=overallStatus(*)`);
  console.log("  overallStatus:", JSON.stringify(overallRes.value.overallStatus, null, 2));

  console.log("\n=== ENTITY IDS ===");
  console.log("customerId:", customerId);
  console.log("emp1Id (Samuel/PM):", emp1Id);
  console.log("emp2Id (Sarah):", emp2Id);
  console.log("projectId:", projectId);
  console.log("activityId:", activityId);
  console.log("suppId:", suppId);
  console.log("invoiceId:", invoiceRes.value.id);
  console.log("voucherId:", voucherRes.value.id);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
