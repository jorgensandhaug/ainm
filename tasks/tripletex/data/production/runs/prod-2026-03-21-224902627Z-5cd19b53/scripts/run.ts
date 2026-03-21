const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "YQNemji56lGNgx71yUwaGwDJYJdePuHRZwfhQ4bfy98";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!r.ok) { console.error(`${method} ${path} → ${r.status}`, JSON.stringify(json).slice(0, 500)); throw new Error(`${r.status}`); }
  console.log(`${method} ${path} → ${r.status}`);
  return json;
}

function utcDate(base: string, offset: number): string {
  const [y, m, d] = base.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
}

function splitHours(total: number, startDate: string): { date: string; hours: number }[] {
  const entries: { date: string; hours: number }[] = [];
  let remaining = total;
  let dayOffset = 0;
  while (remaining > 0) {
    const h = Math.min(remaining, 24);
    entries.push({ date: utcDate(startDate, dayOffset), hours: h });
    remaining -= h;
    dayOffset++;
  }
  return entries;
}

async function main() {
  // Step 1: department + customer + assignable PM (parallel, 3 calls)
  const [deptRes, custRes, pmRes] = await Promise.all([
    api("GET", "/department?isInactive=false&count=1&fields=*"),
    api("POST", "/customer", {
      name: "Grünfeld GmbH",
      organizationNumber: "905570862",
      email: "post@gruenfeld.example.org",
      invoiceEmail: "post@gruenfeld.example.org",
    }),
    api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
  ]);

  let deptId: number;
  if (deptRes.count === 0 || !deptRes.values || deptRes.values.length === 0) {
    const newDept = await api("POST", "/department", { name: "Avdeling" });
    deptId = newDept.value.id;
  } else {
    deptId = deptRes.values[0].id;
  }

  const customerId = custRes.value.id;
  const pmManagerId = pmRes.values[0].id;

  // Step 2: 2 employees + project (parallel, 3 calls)
  const [emp1Res, emp2Res, projRes] = await Promise.all([
    api("POST", "/employee", {
      firstName: "Mia",
      lastName: "Becker",
      email: "mia.becker@example.org",
      dateOfBirth: "1985-01-15",
      userType: "NO_ACCESS",
      department: { id: deptId },
    }),
    api("POST", "/employee", {
      firstName: "Marie",
      lastName: "Becker",
      email: "marie.becker@example.org",
      dateOfBirth: "1987-06-20",
      userType: "NO_ACCESS",
      department: { id: deptId },
    }),
    api("POST", "/project", {
      name: "Datenplattform Grünfeld",
      startDate: TODAY,
      customer: { id: customerId },
      projectManager: { id: pmManagerId },
      isFixedPrice: true,
      fixedprice: 275500,
    }),
  ]);

  const emp1Id = emp1Res.value.id; // Mia - Projektleiter (PM)
  const emp2Id = emp2Res.value.id; // Marie - Berater
  const projectId = projRes.value.id;

  // Step 3: project activity + 2 participants (parallel, 3 calls)
  const totalHours = 35 + 42; // 77
  const [actRes] = await Promise.all([
    api("POST", "/project/projectActivity", {
      project: { id: projectId },
      startDate: TODAY,
      budgetHours: totalHours,
      budgetFeeCurrency: 275500,
      activity: {
        name: "Prosjektaktivitet",
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: false,
      },
    }),
    api("POST", "/project/participant", {
      project: { id: projectId },
      employee: { id: emp1Id },
      adminAccess: true, // PM employee
    }),
    api("POST", "/project/participant", {
      project: { id: projectId },
      employee: { id: emp2Id },
      adminAccess: false,
    }),
  ]);

  const activityId = actRes.value.activity.id;

  // Build timesheet entries
  const miaEntries = splitHours(35, TODAY).map(e => ({
    employee: { id: emp1Id },
    project: { id: projectId },
    activity: { id: activityId },
    date: e.date,
    hours: e.hours,
  }));
  const marieEntries = splitHours(42, TODAY).map(e => ({
    employee: { id: emp2Id },
    project: { id: projectId },
    activity: { id: activityId },
    date: e.date,
    hours: e.hours,
  }));
  const allEntries = [...miaEntries, ...marieEntries];

  // Step 4: timesheet batch + supplier + accounts + voucherType (parallel, 4 calls)
  const [tsRes, suppRes, accRes, vtRes] = await Promise.all([
    api("POST", "/timesheet/entry/list", allEntries),
    api("POST", "/supplier", {
      name: "Sonnental GmbH",
      organizationNumber: "850186332",
      email: "faktura@sonnental.example.org",
      invoiceEmail: "faktura@sonnental.example.org",
    }),
    api("GET", "/ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber"),
    api("GET", "/ledger/voucherType?name=Leverand%C3%B8rfaktura&count=1&fields=id,name"),
  ]);

  const supplierId = suppRes.value.id;
  const accounts = accRes.values as any[];
  const acc1920 = accounts.find((a: any) => a.number === 1920);
  const acc6590 = accounts.find((a: any) => a.number === 6590);
  const acc2400 = accounts.find((a: any) => a.number === 2400);
  const voucherTypeId = vtRes.values[0].id;

  // Step 5: orderline + voucher + vatType (parallel, 3 calls)
  const [olRes, vchRes, vatRes] = await Promise.all([
    api("POST", "/project/orderline", {
      project: { id: projectId },
      description: "Leverandørkostnad fra Sonnental GmbH",
      date: TODAY,
      count: 1,
      unitCostCurrency: 23000,
      isChargeable: false,
    }),
    api("POST", "/ledger/voucher", {
      date: TODAY,
      description: "Leverandørkostnad fra Sonnental GmbH",
      voucherType: { id: voucherTypeId },
      postings: [
        {
          row: 1,
          date: TODAY,
          description: "Leverandørkostnad",
          account: { id: acc6590.id },
          amount: 23000,
          amountCurrency: 23000,
          amountGross: 23000,
          amountGrossCurrency: 23000,
          project: { id: projectId },
        },
        {
          row: 2,
          date: TODAY,
          description: "Leverandørgjeld",
          account: { id: acc2400.id },
          amount: -23000,
          amountCurrency: -23000,
          amountGross: -23000,
          amountGrossCurrency: -23000,
          supplier: { id: supplierId },
        },
      ],
    }),
    api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=" + TODAY + "&fields=*"),
  ]);

  // Find outgoing VAT type (25% standard)
  const vatTypes = vatRes.values as any[];
  const vat25 = vatTypes.find((v: any) => v.percentage === 25.0 && v.name?.includes("25"));
  const vatTypeId = vat25?.id || vatTypes[0]?.id;

  // Step 6: bank account fix if needed
  if (acc1920 && !acc1920.bankAccountNumber) {
    console.log("Bank account 1920 needs bankAccountNumber fix");
    await api("PUT", `/ledger/account/${acc1920.id}`, {
      id: acc1920.id,
      number: acc1920.number,
      name: acc1920.name,
      bankAccountNumber: "12345678903",
    });
  }

  // Step 7: direct invoice
  const dueDate = utcDate(TODAY, 14);
  const invoiceRes = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: dueDate,
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        project: { id: projectId },
        orderDate: TODAY,
        deliveryDate: utcDate(TODAY, 4),
        orderLines: [
          {
            description: "Datenplattform Grünfeld",
            count: 1,
            unitPriceExcludingVatCurrency: 275500,
            vatType: { id: vatTypeId },
          },
        ],
      },
    ],
  });

  console.log("\n=== DONE ===");
  console.log("Customer:", customerId);
  console.log("Employees:", emp1Id, "(Mia PM)", emp2Id, "(Marie)");
  console.log("Project:", projectId);
  console.log("Activity:", activityId);
  console.log("Timesheet entries:", tsRes.values?.length || "?");
  console.log("Supplier:", supplierId);
  console.log("Orderline:", olRes.value?.id);
  console.log("Voucher:", vchRes.value?.id);
  console.log("Invoice:", invoiceRes.value?.id, "number:", invoiceRes.value?.invoiceNumber);
  console.log("Invoice amount:", invoiceRes.value?.amountExcludingVatCurrency);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
