const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "GwQhxMayLymKTnEZo6z8UL2YMkVazIDvTFMi8V_ANGg";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const j = await r.json();
  if (!r.ok) { console.error("GET", path, r.status, JSON.stringify(j)); throw new Error(`GET ${path} ${r.status}`); }
  return j;
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) { console.error("POST", path, r.status, JSON.stringify(j)); throw new Error(`POST ${path} ${r.status}`); }
  return j;
}
async function put(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) { console.error("PUT", path, r.status, JSON.stringify(j)); throw new Error(`PUT ${path} ${r.status}`); }
  return j;
}

function splitHours(total: number, startDate: string): { date: string; hours: number }[] {
  const entries: { date: string; hours: number }[] = [];
  let remaining = total;
  const [y, m, d] = startDate.split("-").map(Number);
  let offset = 0;
  while (remaining > 0) {
    const chunk = Math.min(remaining, 7.5);
    const dt = new Date(Date.UTC(y, m - 1, d + offset));
    entries.push({ date: dt.toISOString().slice(0, 10), hours: chunk });
    remaining -= chunk;
    offset++;
  }
  return entries;
}

async function main() {
  // Step 1: parallel — dept, customer, assignable PM
  const [deptRes, custRes, pmRes] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=*"),
    post("/customer", {
      name: "Brückentor GmbH",
      organizationNumber: "929610156",
      isCustomer: true,
    }),
    get("/employee?assignableProjectManagers=true&count=1&fields=*"),
  ]);

  const deptId = deptRes.values?.[0]?.id;
  const customerId = custRes.value.id;
  const pmId = pmRes.values[0].id;
  console.log("Step 1 done: dept=", deptId, "customer=", customerId, "pm=", pmId);

  // Step 2: parallel — emp1, emp2, project
  const empBase = (first: string, last: string, email: string) => ({
    firstName: first,
    lastName: last,
    email,
    userType: "NO_ACCESS",
    dateOfBirth: "1990-01-01",
    ...(deptId ? { department: { id: deptId } } : {}),
  });

  const [emp1Res, emp2Res, projRes] = await Promise.all([
    post("/employee", empBase("Emma", "Weber", "emma.weber@example.org")),
    post("/employee", empBase("Anna", "Becker", "anna.becker@example.org")),
    post("/project", {
      name: "Systemupgrade Brückentor",
      startDate: TODAY,
      customer: { id: customerId },
      projectManager: { id: pmId },
      isFixedPrice: true,
      fixedprice: 405900,
    }),
  ]);

  const emp1Id = emp1Res.value.id; // Emma Weber - PM
  const emp2Id = emp2Res.value.id; // Anna Becker
  const projectId = projRes.value.id;
  console.log("Step 2 done: emp1=", emp1Id, "emp2=", emp2Id, "project=", projectId);

  // Step 3: parallel — projectActivity, participant (PM), participant (other)
  const totalHours = 73 + 134; // 207
  const [paRes, part1Res, part2Res] = await Promise.all([
    post("/project/projectActivity", {
      project: { id: projectId },
      startDate: TODAY,
      budgetFeeCurrency: 405900,
      budgetHours: totalHours,
      activity: {
        name: "Prosjektaktivitet",
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: false,
      },
    }),
    post("/project/participant", {
      project: { id: projectId },
      employee: { id: emp1Id },
      adminAccess: true,
    }),
    post("/project/participant", {
      project: { id: projectId },
      employee: { id: emp2Id },
      adminAccess: false,
    }),
  ]);

  const activityId = paRes.value.activity.id;
  console.log("Step 3 done: activity=", activityId);

  // Step 4: parallel — timesheet, supplier, accounts, voucherType
  const emmaEntries = splitHours(73, TODAY);
  const annaEntries = splitHours(134, TODAY);
  const timesheetPayload = [
    ...emmaEntries.map(e => ({
      employee: { id: emp1Id },
      project: { id: projectId },
      activity: { id: activityId },
      date: e.date,
      hours: e.hours,
    })),
    ...annaEntries.map(e => ({
      employee: { id: emp2Id },
      project: { id: projectId },
      activity: { id: activityId },
      date: e.date,
      hours: e.hours,
    })),
  ];

  const [tsRes, suppRes, accRes, vtRes] = await Promise.all([
    post("/timesheet/entry/list", timesheetPayload),
    post("/supplier", {
      name: "Silberberg GmbH",
      organizationNumber: "818922248",
      isSupplier: true,
    }),
    get("/ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber"),
    get("/ledger/voucherType?name=Leverand%C3%B8rfaktura&count=1&fields=id,name"),
  ]);

  const supplierId = suppRes.value.id;
  const accounts = accRes.values as { id: number; number: number; name: string; isBankAccount: boolean; bankAccountNumber: string | null }[];
  const acc1920 = accounts.find(a => a.number === 1920)!;
  const acc6590 = accounts.find(a => a.number === 6590)!;
  const acc2400 = accounts.find(a => a.number === 2400)!;
  const voucherTypeId = vtRes.values[0].id;
  console.log("Step 4 done: supplier=", supplierId, "acc1920=", acc1920.id, "acc6590=", acc6590.id, "acc2400=", acc2400.id, "voucherType=", voucherTypeId);
  console.log("  acc1920 bankAccountNumber=", acc1920.bankAccountNumber);

  // Step 5: parallel — orderline, voucher, vatType
  const [olRes, voucherRes, vatRes] = await Promise.all([
    post("/project/orderline", {
      project: { id: projectId },
      description: "Lieferantenkosten Silberberg GmbH",
      date: TODAY,
      count: 1,
      unitCostCurrency: 55650,
      isChargeable: false,
    }),
    post("/ledger/voucher", {
      date: TODAY,
      description: "Lieferantenkosten Silberberg GmbH",
      voucherType: { id: voucherTypeId },
      postings: [
        {
          row: 1,
          account: { id: acc6590.id },
          amount: 55650,
          amountCurrency: 55650,
          amountGross: 55650,
          amountGrossCurrency: 55650,
          project: { id: projectId },
        },
        {
          row: 2,
          account: { id: acc2400.id },
          amount: -55650,
          amountCurrency: -55650,
          amountGross: -55650,
          amountGrossCurrency: -55650,
          supplier: { id: supplierId },
        },
      ],
    }),
    get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=" + TODAY + "&fields=*"),
  ]);

  console.log("Step 5 done: orderline=", olRes.value.id, "voucher=", voucherRes.value.id);

  // Step 6: bank fix if needed
  let bankNeedsFixing = !acc1920.bankAccountNumber;
  if (bankNeedsFixing) {
    console.log("Bank account 1920 needs bankAccountNumber fix");
    await put(`/ledger/account/${acc1920.id}`, {
      id: acc1920.id,
      number: acc1920.number,
      name: acc1920.name,
      bankAccountNumber: "12345678903",
    });
    console.log("Step 6 done: bank fix applied");
  }

  // Step 7: invoice
  const vatType25 = (vatRes.values as any[]).find((v: any) => v.percentage === 25);
  const invoiceDate = TODAY;
  const dueDate = "2026-04-20";

  const invoiceRes = await post("/invoice?sendToCustomer=false", {
    invoiceDate,
    invoiceDueDate: dueDate,
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        project: { id: projectId },
        orderDate: TODAY,
        deliveryDate: TODAY,
        orderLines: [
          {
            description: "Systemupgrade Brückentor",
            count: 1,
            unitPriceExcludingVatCurrency: 405900,
            vatType: { id: vatType25.id },
          },
        ],
      },
    ],
  });

  console.log("Step 7 done: invoice=", invoiceRes.value.id, "invoiceNumber=", invoiceRes.value.invoiceNumber);
  console.log("  amount=", invoiceRes.value.amountExcludingVatCurrency);
  console.log("  projectInvoiceDetails=", JSON.stringify(invoiceRes.value.projectInvoiceDetails));
  console.log("\nDONE. Total steps: 7");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
