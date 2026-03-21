// Sandbox investigation for task 29 checks 3,4,5,7
// Testing hypotheses about what the scorer checks

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
  }
  return { status: r.status, data: json };
}

async function main() {
  const uid = Math.random().toString(36).slice(2, 8);
  console.log("=== SANDBOX INVESTIGATION uid:", uid, "===\n");

  // Step 1: Get prerequisites
  const [deptRes, pmRes] = await Promise.all([
    api("GET", "/department?isInactive=false&count=1&fields=*"),
    api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
  ]);
  const deptId = deptRes.data.values?.[0]?.id;
  const pmId = pmRes.data.values[0].id;
  console.log("deptId:", deptId, "pmId:", pmId);

  // Step 2: Create customer
  const custRes = await api("POST", "/customer", {
    name: `TestCust ${uid} AS`,
    organizationNumber: "857400526",
    isCustomer: true,
  });
  const customerId = custRes.data.value.id;
  console.log("customerId:", customerId);

  // Step 3: Create two employees
  const [emp1Res, emp2Res] = await Promise.all([
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
  ]);
  const emp1Id = emp1Res.data.value.id;
  const emp2Id = emp2Res.data.value.id;
  console.log("emp1Id:", emp1Id, "emp2Id:", emp2Id);

  // Step 4: Create project WITH isFixedPrice + fixedprice
  console.log("\n=== TESTING isFixedPrice + fixedprice on project ===");
  const projRes = await api("POST", "/project", {
    name: `Migração Cloud ${uid}`,
    startDate: TODAY,
    customer: { id: customerId },
    projectManager: { id: pmId },
    isFixedPrice: true,
    fixedprice: 229500,
  });
  const projectId = projRes.data.value.id;
  console.log("projectId:", projectId);
  console.log("project.isFixedPrice:", projRes.data.value.isFixedPrice);
  console.log("project.fixedprice:", projRes.data.value.fixedprice);

  // Step 5: Create project activity WITH budgetHours + budgetFeeCurrency
  console.log("\n=== TESTING budgetHours + budgetFeeCurrency on projectActivity ===");
  const paRes = await api("POST", "/project/projectActivity", {
    project: { id: projectId },
    startDate: TODAY,
    budgetFeeCurrency: 229500,
    budgetHours: 99,
    activity: {
      name: "Prosjektaktivitet",
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: false,
    },
  });
  const activityId = paRes.data.value.activity.id;
  console.log("activityId:", activityId);
  console.log("budgetFeeCurrency:", paRes.data.value.budgetFeeCurrency);
  console.log("budgetHours:", paRes.data.value.budgetHours);

  // Step 6: Add participants - Catarina as PM (adminAccess: true), João (adminAccess: false)
  console.log("\n=== TESTING adminAccess on participants ===");
  const [part1Res, part2Res] = await Promise.all([
    api("POST", "/project/participant", {
      project: { id: projectId },
      employee: { id: emp1Id },
      adminAccess: true,
    }),
    api("POST", "/project/participant", {
      project: { id: projectId },
      employee: { id: emp2Id },
      adminAccess: false,
    }),
  ]);
  console.log("participant1 (Catarina, admin):", part1Res.status, "adminAccess:", part1Res.data.value?.adminAccess);
  console.log("participant2 (João):", part2Res.status, "adminAccess:", part2Res.data.value?.adminAccess);

  // Step 7: Register timesheet hours
  console.log("\n=== TESTING timesheet entries ===");
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

  const tsRes = await api("POST", "/timesheet/entry/list", timesheetEntries);
  const tsTotal = tsRes.data.values?.reduce((s: number, e: any) => s + e.hours, 0);
  console.log("timesheet entries created:", tsRes.data.values?.length, "total hours:", tsTotal);

  // Step 8: Create supplier + supplier cost via voucher
  console.log("\n=== TESTING supplier cost via voucher ===");
  const [suppRes, accRes, vtRes] = await Promise.all([
    api("POST", "/supplier", {
      name: `Oceano ${uid} Lda`,
      organizationNumber: "941830420",
      isSupplier: true,
    }),
    api("GET", "/ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber"),
    api("GET", "/ledger/voucherType?name=Leverand%C3%B8rfaktura&count=1&fields=id,name"),
  ]);
  const suppId = suppRes.data.value.id;
  const accounts = accRes.data.values;
  const acc6590 = accounts.find((a: any) => a.number === 6590);
  const acc2400 = accounts.find((a: any) => a.number === 2400);
  const acc1920 = accounts.find((a: any) => a.number === 1920);
  const voucherTypeId = vtRes.data.values[0].id;
  console.log("suppId:", suppId, "acc6590:", acc6590?.id, "acc2400:", acc2400?.id, "acc1920:", acc1920?.id);
  console.log("voucherTypeId:", voucherTypeId);

  const voucherRes = await api("POST", "/ledger/voucher", {
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
  });
  console.log("voucherId:", voucherRes.data.value?.id);

  // Step 9: Get VAT type + fix bank account if needed
  const vatRes = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
  const vatType = vatRes.data.values.find((v: any) => v.percentage === 25.0) || vatRes.data.values[0];
  console.log("vatTypeId:", vatType.id, "vatPct:", vatType.percentage);

  if (acc1920 && !acc1920.bankAccountNumber) {
    console.log("Fixing bank account...");
    await api("PUT", `/ledger/account/${acc1920.id}`, {
      ...acc1920,
      bankAccountNumber: "12345678903",
    });
  }

  // Step 10: Create invoice
  console.log("\n=== TESTING invoice ===");
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
            description: `Migração Cloud ${uid} - Prosjekttjenester`,
            count: 1,
            unitPriceExcludingVatCurrency: 229500,
            vatType: { id: vatType.id },
          },
        ],
      },
    ],
  });
  console.log("invoiceId:", invoiceRes.data.value?.id);
  console.log("invoiceNumber:", invoiceRes.data.value?.invoiceNumber);
  console.log("amountExcludingVat:", invoiceRes.data.value?.amountExcludingVatCurrency);
  console.log("projectInvoiceDetails:", invoiceRes.data.value?.projectInvoiceDetails?.length);

  // Step 11: NOW READ BACK AND INSPECT all the fields a scorer might check
  console.log("\n=== READBACK: Project ===");
  const projReadback = await api("GET", `/project/${projectId}?fields=*`);
  const proj = projReadback.data.value;
  console.log("project.name:", proj.name);
  console.log("project.isFixedPrice:", proj.isFixedPrice);
  console.log("project.fixedprice:", proj.fixedprice);
  console.log("project.projectManager.id:", proj.projectManager?.id);
  console.log("project.projectManager.firstName:", proj.projectManager?.firstName);
  console.log("project.projectManager.lastName:", proj.projectManager?.lastName);
  console.log("project.customer.id:", proj.customer?.id);

  console.log("\n=== READBACK: Project Activity ===");
  const paReadback = await api("GET", `/project/projectActivity?projectId=${projectId}&fields=*`);
  if (paReadback.data.values?.length > 0) {
    const pa = paReadback.data.values[0];
    console.log("pa.budgetFeeCurrency:", pa.budgetFeeCurrency);
    console.log("pa.budgetHours:", pa.budgetHours);
    console.log("pa.activity.id:", pa.activity?.id);
    console.log("pa.activity.name:", pa.activity?.name);
  }

  console.log("\n=== READBACK: Participants ===");
  const partReadback = await api("GET", `/project/participant?projectId=${projectId}&fields=*`);
  for (const p of partReadback.data.values || []) {
    console.log(`  participant: emp=${p.employee?.id} (${p.employee?.firstName} ${p.employee?.lastName}) adminAccess=${p.adminAccess}`);
  }

  console.log("\n=== READBACK: Timesheet entries ===");
  const tsReadback = await api("GET", `/timesheet/entry?projectId=${projectId}&fields=*&count=100`);
  let totalHrs = 0;
  const empHours: Record<string, number> = {};
  for (const e of tsReadback.data.values || []) {
    totalHrs += e.hours;
    const key = `${e.employee?.firstName} ${e.employee?.lastName}`;
    empHours[key] = (empHours[key] || 0) + e.hours;
  }
  console.log("total timesheet hours:", totalHrs);
  for (const [name, hrs] of Object.entries(empHours)) {
    console.log(`  ${name}: ${hrs}h`);
  }

  console.log("\n=== READBACK: Project period/overall status ===");
  const statusRes = await api("GET", `/project/${projectId}/period/overallStatus?dateFrom=${TODAY}&dateTo=2026-12-31&fields=*`);
  if (statusRes.status === 200) {
    const s = statusRes.data.value;
    console.log("overallStatus:", JSON.stringify(s, null, 2).slice(0, 1000));
  }

  // Check what fields might hold budget information on the project
  console.log("\n=== READBACK: All project fields ===");
  console.log("Full project:", JSON.stringify(proj, null, 2).slice(0, 2000));

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
