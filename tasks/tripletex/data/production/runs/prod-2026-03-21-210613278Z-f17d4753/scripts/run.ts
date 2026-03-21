const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "bDmDv_MlCV88rPPJDzVSlnCCrFap0kzVVK9xbctpj08";
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
    console.log("ERROR:", JSON.stringify(json).slice(0, 500));
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
  // Step 1: GET department + GET division + POST customer (parallel)
  const [deptRes, divRes, custRes] = await Promise.all([
    api("GET", "/department?isInactive=false&count=1&fields=*"),
    api("GET", "/division?count=1&fields=*"),
    api("POST", "/customer", {
      name: "Horizonte Lda",
      organizationNumber: "857400526",
      isCustomer: true,
    }),
  ]);

  const deptId = deptRes.values?.[0]?.id;
  const divId = divRes.values?.[0]?.id;
  const customerId = custRes.value.id;
  console.log("customerId:", customerId, "deptId:", deptId, "divId:", divId);

  if (!deptId) {
    // Recovery: create department
    const deptCreate = await api("POST", "/department", { name: "Avdeling" });
    // Would use deptCreate.value.id
  }

  // Step 2: POST employee 1 (Catarina Martins)
  const emp1Employment: any = { startDate: TODAY };
  if (divId) emp1Employment.division = { id: divId };
  const emp1Res = await api("POST", "/employee", {
    firstName: "Catarina",
    lastName: "Martins",
    email: "catarina.martins@example.org",
    dateOfBirth: "1990-01-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [emp1Employment],
  });
  const emp1Id = emp1Res.value.id;
  console.log("emp1Id:", emp1Id);

  // Step 3: GET assignable PM + POST employee 2 (João Martins) (parallel)
  const emp2Employment: any = { startDate: TODAY };
  if (divId) emp2Employment.division = { id: divId };
  const [pmRes, emp2Res] = await Promise.all([
    api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
    api("POST", "/employee", {
      firstName: "João",
      lastName: "Martins",
      email: "joao.martins@example.org",
      dateOfBirth: "1992-06-20",
      userType: "NO_ACCESS",
      department: { id: deptId },
      employments: [emp2Employment],
    }),
  ]);
  const pmId = pmRes.values[0].id;
  const emp2Id = emp2Res.value.id;
  console.log("pmId:", pmId, "emp2Id:", emp2Id);

  // Step 4: POST project
  const projRes = await api("POST", "/project", {
    name: "Migração Cloud Horizonte",
    startDate: TODAY,
    customer: { id: customerId },
    projectManager: { id: pmId },
  });
  const projectId = projRes.value.id;
  console.log("projectId:", projectId);

  // Step 5: POST projectActivity + POST participant x2 (parallel)
  const [paRes] = await Promise.all([
    api("POST", "/project/projectActivity", {
      project: { id: projectId },
      startDate: TODAY,
      budgetFeeCurrency: 229500,
      activity: {
        name: "Prosjektaktivitet",
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: false,
      },
    }),
    api("POST", "/project/participant", {
      project: { id: projectId },
      employee: { id: emp1Id },
      adminAccess: false,
    }),
    api("POST", "/project/participant", {
      project: { id: projectId },
      employee: { id: emp2Id },
      adminAccess: false,
    }),
  ]);
  const activityId = paRes.value.activity.id;
  console.log("activityId:", activityId, "budget:", paRes.value.budgetFeeCurrency);

  // Step 6: POST timesheet/entry/list + POST supplier + GET accounts + GET voucherType (parallel)
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
      name: "Oceano Lda",
      organizationNumber: "941830420",
      isSupplier: true,
    }),
    api("GET", "/ledger/account?number=6590,2400&fields=id,number,name"),
    api("GET", "/ledger/voucherType?name=Leverand%C3%B8rfaktura&count=1&fields=id,name"),
  ]);

  const suppId = suppRes.value.id;
  console.log("supplierId:", suppId);

  const accounts = accRes.values;
  const acc6590 = accounts.find((a: any) => a.number === 6590);
  const acc2400 = accounts.find((a: any) => a.number === 2400);
  console.log("acc6590:", acc6590?.id, "acc2400:", acc2400?.id);

  const voucherTypeId = vtRes.values[0].id;
  console.log("voucherTypeId:", voucherTypeId);

  const tsTotal = tsRes.values.reduce((s: number, e: any) => s + e.hours, 0);
  console.log("timesheet total hours:", tsTotal);

  // Step 7: POST voucher + GET vatType + GET bank accounts (parallel)
  const [voucherRes, vatRes, bankRes] = await Promise.all([
    api("POST", "/ledger/voucher", {
      date: TODAY,
      description: "Oceano Lda - leverandørkostnad",
      voucherType: { id: voucherTypeId },
      postings: [
        {
          row: 1,
          account: { id: acc6590!.id },
          amount: 56300,
          amountCurrency: 56300,
          amountGross: 56300,
          amountGrossCurrency: 56300,
          project: { id: projectId },
        },
        {
          row: 2,
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
    api("GET", "/ledger/account?isBankAccount=true&fields=*"),
  ]);

  console.log("voucherId:", voucherRes.value.id);

  // Find outgoing VAT type (25%)
  const vatType = vatRes.values.find((v: any) => v.percentage === 25.0) || vatRes.values[0];
  console.log("vatTypeId:", vatType.id, "vatPct:", vatType.percentage);

  // Find bank account, fix if needed
  let bankAccount = bankRes.values.find((a: any) => a.bankAccountNumber) || bankRes.values[0];
  console.log("bankAccountId:", bankAccount.id, "bankAccountNumber:", bankAccount.bankAccountNumber);

  // Step 8: if bank account lacks bankAccountNumber, PUT once
  if (!bankAccount.bankAccountNumber) {
    console.log("Bank account lacks bankAccountNumber, fixing...");
    await api("PUT", `/ledger/account/${bankAccount.id}`, {
      ...bankAccount,
      bankAccountNumber: "12345678903",
    });
    bankAccount.bankAccountNumber = "12345678903";
  }

  // Step 9: POST invoice
  const invoiceDueDate = "2026-04-20";
  const invoiceRes = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: invoiceDueDate,
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        project: { id: projectId },
        orderDate: TODAY,
        deliveryDate: TODAY,
        orderLines: [
          {
            description: "Migração Cloud Horizonte - Prosjekttjenester",
            count: 1,
            unitPriceExcludingVatCurrency: 229500,
            vatType: { id: vatType.id },
          },
        ],
      },
    ],
  });

  console.log("invoiceId:", invoiceRes.value.id);
  console.log("invoiceNumber:", invoiceRes.value.invoiceNumber);
  console.log("amountExcludingVat:", invoiceRes.value.amountExcludingVatCurrency);
  console.log("projectInvoiceDetails:", invoiceRes.value.projectInvoiceDetails?.length);
  console.log("\n=== DONE ===");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
