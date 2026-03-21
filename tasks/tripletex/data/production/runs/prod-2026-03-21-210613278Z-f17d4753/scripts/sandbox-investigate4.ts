// Investigate:
// 1. projectInvoiceDetails feeAmount and what populates it
// 2. Do we need both orderline + voucher?
// 3. What exactly does the scorer check on the project?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

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
  if (r.status >= 400) {
    console.log(`${method} ${path} → ${r.status} ERROR:`, JSON.stringify(json).slice(0, 800));
  } else {
    console.log(`${method} ${path} → ${r.status}`);
  }
  return { status: r.status, data: json };
}

async function main() {
  // Use the project from previous sandbox run
  const projectId = 402041125;
  const invoiceId = 2147644038;

  // 1. Expand invoice projectInvoiceDetails fully
  console.log("=== Invoice details expanded ===");
  const invRes = await api("GET", `/invoice/details/1965798048?fields=*`);
  if (invRes.status === 200) {
    console.log("invoiceDetail:", JSON.stringify(invRes.data.value, null, 2));
  }

  // 2. Check project period monthly status
  console.log("\n=== Project period/monthly status ===");
  const monthlyRes = await api("GET", `/project/${projectId}/period/monthlyStatus?dateFrom=2026-03-01&dateTo=2026-03-31&fields=*`);
  if (monthlyRes.status === 200) {
    console.log("monthlyStatus:", JSON.stringify(monthlyRes.data, null, 2)?.slice(0, 1500));
  }

  // 3. Check project period hourly status
  console.log("\n=== Project period/hourly status ===");
  const hourlyRes = await api("GET", `/project/${projectId}/period/hourlyStatus?dateFrom=2026-03-01&dateTo=2026-12-31&fields=*`);
  if (hourlyRes.status === 200) {
    console.log("hourlyStatus:", JSON.stringify(hourlyRes.data, null, 2)?.slice(0, 1500));
  }

  // 4. Check project period invoiced status
  console.log("\n=== Project period/invoiced status ===");
  const invoicedRes = await api("GET", `/project/${projectId}/period/invoiced?dateFrom=2026-03-01&dateTo=2026-12-31&fields=*`);
  if (invoicedRes.status === 200) {
    console.log("invoicedStatus:", JSON.stringify(invoicedRes.data, null, 2)?.slice(0, 1500));
  }

  // 5. Now create a fresh project to test the FULL correct flow
  // with isFixedPrice, fixedprice, budgetHours, adminAccess, orderline+voucher
  console.log("\n\n========================================");
  console.log("=== FULL FLOW TEST (new project) ===");
  console.log("========================================\n");

  const uid = Math.random().toString(36).slice(2, 8);
  const TODAY = "2026-03-21";

  // Get prerequisites
  const [deptRes, pmRes] = await Promise.all([
    api("GET", "/department?isInactive=false&count=1&fields=*"),
    api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
  ]);
  const deptId = deptRes.data.values?.[0]?.id;
  const pmId = pmRes.data.values[0].id;

  // Create customer
  const custRes = await api("POST", "/customer", {
    name: `FullTest ${uid} AS`,
    organizationNumber: "857400526",
    isCustomer: true,
  });
  const customerId = custRes.data.value.id;

  // Create two employees
  const [emp1Res, emp2Res] = await Promise.all([
    api("POST", "/employee", {
      firstName: "Catarina",
      lastName: "Martins",
      email: `cat.${uid}@example.org`,
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

  // Create project WITH isFixedPrice + fixedprice
  const projRes = await api("POST", "/project", {
    name: `FullTest Cloud ${uid}`,
    startDate: TODAY,
    customer: { id: customerId },
    projectManager: { id: pmId },
    isFixedPrice: true,
    fixedprice: 229500,
  });
  const newProjectId = projRes.data.value.id;
  console.log("projectId:", newProjectId, "fixedprice:", projRes.data.value.fixedprice);

  // Create project activity WITH budgetHours + budgetFeeCurrency
  const paRes = await api("POST", "/project/projectActivity", {
    project: { id: newProjectId },
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

  // Add participants - Catarina as PM (adminAccess: true), João (adminAccess: false)
  const [part1Res, part2Res] = await Promise.all([
    api("POST", "/project/participant", {
      project: { id: newProjectId },
      employee: { id: emp1Id },
      adminAccess: true,
    }),
    api("POST", "/project/participant", {
      project: { id: newProjectId },
      employee: { id: emp2Id },
      adminAccess: false,
    }),
  ]);

  // Register timesheet hours
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
      project: { id: newProjectId },
      activity: { id: activityId },
      date: c.date,
      hours: c.hours,
    })),
    ...emp2Chunks.map(c => ({
      employee: { id: emp2Id },
      project: { id: newProjectId },
      activity: { id: activityId },
      date: c.date,
      hours: c.hours,
    })),
  ];

  // Create supplier + get accounts + get voucherType (parallel)
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
  const suppId = suppRes.data.value.id;
  const accounts = accRes.data.values;
  const acc6590 = accounts.find((a: any) => a.number === 6590);
  const acc2400 = accounts.find((a: any) => a.number === 2400);
  const acc1920 = accounts.find((a: any) => a.number === 1920);
  const voucherTypeId = vtRes.data.values[0].id;

  // Create BOTH:
  // A) Project orderline for cost tracking in project status
  // B) Leverandørfaktura voucher for supplier linkage
  const [olRes, voucherRes, vatRes] = await Promise.all([
    api("POST", "/project/orderline", {
      project: { id: newProjectId },
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
          project: { id: newProjectId },
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
  console.log("orderlineId:", olRes.data.value?.id, "voucherId:", voucherRes.data.value?.id);
  const vatType = vatRes.data.values.find((v: any) => v.percentage === 25.0) || vatRes.data.values[0];

  // Fix bank account if needed
  if (acc1920 && !acc1920.bankAccountNumber) {
    await api("PUT", `/ledger/account/${acc1920.id}`, {
      ...acc1920,
      bankAccountNumber: "12345678903",
    });
  }

  // Create invoice
  const invoiceRes = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: "2026-04-20",
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        project: { id: newProjectId },
        orderDate: TODAY,
        deliveryDate: TODAY,
        orderLines: [
          {
            description: `FullTest Cloud ${uid} - Prosjekttjenester`,
            count: 1,
            unitPriceExcludingVatCurrency: 229500,
            vatType: { id: vatType.id },
          },
        ],
      },
    ],
  });
  console.log("invoiceId:", invoiceRes.data.value?.id);
  console.log("amountExcludingVat:", invoiceRes.data.value?.amountExcludingVatCurrency);

  // Now readback everything
  console.log("\n=== READBACK: project overallStatus ===");
  const statusRes = await api("GET", `/project/${newProjectId}/period/overallStatus?dateFrom=2026-01-01&dateTo=2026-12-31&fields=*`);
  console.log("overallStatus:", JSON.stringify(statusRes.data.value, null, 2));

  console.log("\n=== READBACK: project ===");
  const projReadback = await api("GET", `/project/${newProjectId}?fields=id,name,fixedprice,isFixedPrice,numberOfProjectParticipants,orderLines(*),projectActivities(*),participants(*)`);
  const p = projReadback.data.value;
  console.log("fixedprice:", p.fixedprice, "isFixedPrice:", p.isFixedPrice);
  console.log("numberOfProjectParticipants:", p.numberOfProjectParticipants);
  console.log("orderLines count:", p.orderLines?.length);
  for (const ol of p.orderLines || []) {
    console.log(`  orderline: desc="${ol.description}" unitCost=${ol.unitCostCurrency} unitPrice=${ol.unitPriceExcludingVatCurrency} vendor=${JSON.stringify(ol.vendor)}`);
  }
  console.log("participants count:", p.participants?.length);
  for (const part of p.participants || []) {
    console.log(`  participant: emp=${part.employee?.id} admin=${part.adminAccess}`);
  }
  console.log("projectActivities:");
  for (const pa of p.projectActivities || []) {
    console.log(`  pa: budget=${pa.budgetFeeCurrency} hours=${pa.budgetHours}`);
  }

  // Read invoice details
  console.log("\n=== READBACK: invoice details ===");
  const invReadback = await api("GET", `/invoice/${invoiceRes.data.value?.id}?fields=*,projectInvoiceDetails(*)`);
  const inv = invReadback.data.value;
  for (const detail of inv?.projectInvoiceDetails || []) {
    console.log(`  detail: project=${detail.project?.id} feeAmount=${detail.feeAmount} feeAmountProjectCurrency=${detail.feeAmountProjectCurrency}`);
  }

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
