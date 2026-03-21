// FULL FLOW TEST with ALL hypothesized fixes:
// 1. isFixedPrice: true + fixedprice on project
// 2. budgetHours on project activity
// 3. adminAccess: true for PM employee participant
// 4. BOTH project orderline (for overallStatus costs) AND voucher (for supplier linkage)
// 5. Correct invoice structure

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Content-Type": "application/json", Authorization: AUTH },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (r.status >= 400) {
    console.log("ERROR:", JSON.stringify(json).slice(0, 800));
    throw new Error(`${method} ${path} → ${r.status}`);
  }
  return json;
}

function splitHours(total: number, startDate: string): { date: string; hours: number }[] {
  const chunks: { date: string; hours: number }[] = [];
  const [y, m, d] = startDate.split("-").map(Number);
  let remaining = total;
  let offset = 0;
  while (remaining > 0) {
    const h = Math.min(remaining, 7.5);
    const dt = new Date(Date.UTC(y, m - 1, d + offset));
    chunks.push({ date: dt.toISOString().slice(0, 10), hours: h });
    remaining -= h;
    offset++;
  }
  return chunks;
}

async function main() {
  const uid = Math.random().toString(36).slice(2, 8);
  console.log("=== FULL FLOW TEST uid:", uid, "===\n");
  let callCount = 0;
  const origApi = api;

  // Step 1: GET dept + POST customer + GET assignable PM (parallel)
  const [deptRes, custRes, pmRes] = await Promise.all([
    api("GET", "/department?isInactive=false&count=1&fields=*"),
    api("POST", "/customer", {
      name: `Horizonte ${uid} Lda`,
      organizationNumber: "857400526",
      isCustomer: true,
    }),
    api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
  ]);
  callCount += 3;
  const deptId = deptRes.values?.[0]?.id;
  const customerId = custRes.value.id;
  const pmId = pmRes.values[0].id;
  console.log("deptId:", deptId, "customerId:", customerId, "pmId:", pmId);

  // Step 2: POST emp1 + POST emp2 + POST project (parallel)
  const [emp1Res, emp2Res, projRes] = await Promise.all([
    api("POST", "/employee", {
      firstName: "Catarina",
      lastName: "Martins",
      email: `catarina.${uid}@example.org`,
      dateOfBirth: "1990-01-15",
      userType: "NO_ACCESS",
      department: { id: deptId },
    }),
    api("POST", "/employee", {
      firstName: "João",
      lastName: "Martins",
      email: `joao.${uid}@example.org`,
      dateOfBirth: "1992-06-20",
      userType: "NO_ACCESS",
      department: { id: deptId },
    }),
    api("POST", "/project", {
      name: `Migração Cloud Horizonte ${uid}`,
      startDate: TODAY,
      customer: { id: customerId },
      projectManager: { id: pmId },
      isFixedPrice: true,       // FIX: was missing
      fixedprice: 229500,        // FIX: was missing
    }),
  ]);
  callCount += 3;
  const emp1Id = emp1Res.value.id;
  const emp2Id = emp2Res.value.id;
  const projectId = projRes.value.id;
  console.log("emp1Id:", emp1Id, "emp2Id:", emp2Id, "projectId:", projectId);
  console.log("project.isFixedPrice:", projRes.value.isFixedPrice, "fixedprice:", projRes.value.fixedprice);

  // Step 3: POST projectActivity + POST participant (emp1 as admin) + POST participant (emp2)
  const [paRes, part1Res, part2Res] = await Promise.all([
    api("POST", "/project/projectActivity", {
      project: { id: projectId },
      startDate: TODAY,
      budgetFeeCurrency: 229500,
      budgetHours: 99,            // FIX: was missing
      activity: {
        name: "Prosjektaktivitet",
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: false,
      },
    }),
    api("POST", "/project/participant", {
      project: { id: projectId },
      employee: { id: emp1Id },
      adminAccess: true,           // FIX: was false
    }),
    api("POST", "/project/participant", {
      project: { id: projectId },
      employee: { id: emp2Id },
      adminAccess: false,
    }),
  ]);
  callCount += 3;
  const activityId = paRes.value.activity.id;
  console.log("activityId:", activityId);
  console.log("budgetFeeCurrency:", paRes.value.budgetFeeCurrency, "budgetHours:", paRes.value.budgetHours);
  console.log("participant1 admin:", part1Res.value.adminAccess, "participant2 admin:", part2Res.value.adminAccess);

  // Step 4: POST timesheet/entry/list + POST supplier + GET accounts + GET voucherType (parallel)
  const emp1Chunks = splitHours(37, TODAY);
  const emp2Chunks = splitHours(62, TODAY);
  const timesheetEntries = [
    ...emp1Chunks.map(c => ({
      employee: { id: emp1Id },
      project: { id: projectId },
      activity: { id: activityId },
      date: c.date,
      hours: c.hours,
    })),
    ...emp2Chunks.map(c => ({
      employee: { id: emp2Id },
      project: { id: projectId },
      activity: { id: activityId },
      date: c.date,
      hours: c.hours,
    })),
  ];

  const [tsRes, suppRes, accRes, vtRes] = await Promise.all([
    api("POST", "/timesheet/entry/list", timesheetEntries),
    api("POST", "/supplier", {
      name: `Oceano ${uid} Lda`,
      organizationNumber: "941830420",
      isSupplier: true,
    }),
    api("GET", "/ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber"),
    api("GET", "/ledger/voucherType?name=Leverand%C3%B8rfaktura&count=1&fields=id,name"),
  ]);
  callCount += 4;
  const suppId = suppRes.value.id;
  const accounts = accRes.values;
  const acc6590 = accounts.find((a: any) => a.number === 6590);
  const acc2400 = accounts.find((a: any) => a.number === 2400);
  const acc1920 = accounts.find((a: any) => a.number === 1920);
  const voucherTypeId = vtRes.values[0].id;
  const tsTotal = tsRes.values.reduce((s: number, e: any) => s + e.hours, 0);
  console.log("timesheet total:", tsTotal, "suppId:", suppId);

  // Step 5: POST orderline (for costs) + POST voucher (for supplier linkage) + GET vatType (parallel)
  const [olRes, voucherRes, vatRes] = await Promise.all([
    api("POST", "/project/orderline", {       // FIX: ADD orderline for costs
      project: { id: projectId },
      description: `Leverandørkostnad Oceano ${uid} Lda`,
      date: TODAY,
      count: 1,
      unitCostCurrency: 56300,
      isChargeable: false,
    }),
    api("POST", "/ledger/voucher", {
      date: TODAY,
      description: `Leverandørkostnad Oceano ${uid} Lda`,
      voucherType: { id: voucherTypeId },
      postings: [
        {
          row: 1,
          date: TODAY,
          description: "Leverandørkostnad",
          account: { id: acc6590!.id },
          amount: 56300,
          amountCurrency: 56300,
          amountGross: 56300,
          amountGrossCurrency: 56300,
          project: { id: projectId },
        },
        {
          row: 2,
          date: TODAY,
          description: "Leverandørgjeld",
          account: { id: acc2400!.id },
          amount: -56300,
          amountCurrency: -56300,
          amountGross: -56300,
          amountGrossCurrency: -56300,
          supplier: { id: suppId },
        },
      ],
    }),
    api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
  ]);
  callCount += 3;
  const vatType = vatRes.values.find((v: any) => v.percentage === 25.0) || vatRes.values[0];
  console.log("orderlineId:", olRes.value.id, "voucherId:", voucherRes.value.id, "vatType:", vatType.id);

  // Step 6: Fix bank account if needed
  if (acc1920 && !acc1920.bankAccountNumber) {
    console.log("Fixing bank account...");
    await api("PUT", `/ledger/account/${acc1920.id}`, {
      ...acc1920,
      bankAccountNumber: "12345678903",
    });
    callCount += 1;
  }

  // Step 7: POST invoice
  const invoiceRes = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: "2026-04-20",
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        project: { id: projectId },
        orderDate: TODAY,
        deliveryDate: TODAY,
        orderLines: [
          {
            description: `Migração Cloud Horizonte ${uid} - Prosjekttjenester`,
            count: 1,
            unitPriceExcludingVatCurrency: 229500,
            vatType: { id: vatType.id },
          },
        ],
      },
    ],
  });
  callCount += 1;
  console.log("invoiceId:", invoiceRes.value.id);
  console.log("amountExcludingVat:", invoiceRes.value.amountExcludingVatCurrency);

  // =====================================
  // READBACK: Check all scorer-relevant fields
  // =====================================
  console.log("\n\n=== READBACK ===\n");

  // Project
  const projRead = await api("GET", `/project/${projectId}?fields=*`);
  const p = projRead.value;
  console.log("PROJECT:");
  console.log("  name:", p.name);
  console.log("  isFixedPrice:", p.isFixedPrice);
  console.log("  fixedprice:", p.fixedprice);
  console.log("  projectManager.id:", p.projectManager?.id);
  console.log("  numberOfProjectParticipants:", p.numberOfProjectParticipants);
  console.log("  invoiceReserveTotalAmountCurrency:", p.invoiceReserveTotalAmountCurrency);

  // Project activities
  const projActs = await api("GET", `/project/${projectId}?fields=projectActivities(*)`);
  console.log("\nPROJECT ACTIVITIES:");
  for (const pa of projActs.value.projectActivities || []) {
    console.log(`  budget=${pa.budgetFeeCurrency} hours=${pa.budgetHours}`);
  }

  // Participants
  const projParts = await api("GET", `/project/${projectId}?fields=participants(*)`);
  console.log("\nPARTICIPANTS:");
  for (const part of projParts.value.participants || []) {
    console.log(`  emp=${part.employee?.id} admin=${part.adminAccess}`);
  }

  // Timesheet
  const tsRead = await api("GET", `/timesheet/entry?projectId=${projectId}&dateFrom=2026-03-01&dateTo=2026-12-31&fields=*&count=100`);
  const empHours: Record<number, number> = {};
  for (const e of tsRead.values || []) {
    empHours[e.employee?.id] = (empHours[e.employee?.id] || 0) + e.hours;
  }
  console.log("\nTIMESHEET:");
  for (const [empId, hrs] of Object.entries(empHours)) {
    console.log(`  emp ${empId}: ${hrs}h`);
  }
  console.log("  total:", Object.values(empHours).reduce((a, b) => a + b, 0));

  // Overall status
  const statusRead = await api("GET", `/project/${projectId}/period/overallStatus?dateFrom=2026-01-01&dateTo=2026-12-31&fields=*`);
  console.log("\nOVERALL STATUS:");
  console.log("  income:", statusRead.value.income);
  console.log("  costs:", statusRead.value.costs);

  // Invoice
  const invRead = await api("GET", `/invoice/${invoiceRes.value.id}?fields=*`);
  console.log("\nINVOICE:");
  console.log("  amount:", invRead.value.amountExcludingVatCurrency);
  console.log("  projectInvoiceDetails count:", invRead.value.projectInvoiceDetails?.length);

  // Invoice detail expansion
  if (invRead.value.projectInvoiceDetails?.length > 0) {
    const detailId = invRead.value.projectInvoiceDetails[0].id;
    const detailRead = await api("GET", `/invoice/details/${detailId}?fields=*`);
    console.log("  detail.feeAmount:", detailRead.value.feeAmount);
    console.log("  detail.amountOrderLinesAndReinvoicing:", detailRead.value.amountOrderLinesAndReinvoicing);
  }

  // Supplier check
  const suppRead = await api("GET", `/supplier/${suppId}?fields=*`);
  console.log("\nSUPPLIER:");
  console.log("  name:", suppRead.value.name);
  console.log("  organizationNumber:", suppRead.value.organizationNumber);

  // Project orderlines
  const olRead = await api("GET", `/project/orderline?projectId=${projectId}&fields=*&count=10`);
  console.log("\nPROJECT ORDERLINES:");
  for (const ol of olRead.values || []) {
    console.log(`  desc="${ol.description}" cost=${ol.unitCostCurrency} price=${ol.unitPriceExcludingVatCurrency} vendor=${ol.vendor?.id || 'null'}`);
  }

  console.log("\n=== TOTAL API CALLS:", callCount, "===");
  console.log("=== DONE ===");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
