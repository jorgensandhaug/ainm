const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "PNtqqzqyzyKZVOwMgwuBLVIhuiydPIQIoePl6KNtN8k";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!r.ok) {
    console.error(`${method} ${path} -> ${r.status}`, JSON.stringify(json).slice(0, 500));
    throw new Error(`${r.status} on ${method} ${path}`);
  }
  console.log(`${method} ${path} -> ${r.status}`);
  return json;
}

function splitHours(total: number, startDate: string): { date: string; hours: number }[] {
  const entries: { date: string; hours: number }[] = [];
  const [y, m, d] = startDate.split("-").map(Number);
  let remaining = total;
  let offset = 0;
  while (remaining > 0) {
    const h = Math.min(remaining, 7.5);
    const dt = new Date(Date.UTC(y, m - 1, d + offset));
    entries.push({ date: dt.toISOString().slice(0, 10), hours: h });
    remaining -= h;
    offset++;
  }
  return entries;
}

async function main() {
  // ── Step 1: dept + customer + assignable PM (parallel, 3 calls) ──
  const [deptRes, custRes, pmRes] = await Promise.all([
    api("GET", "/department?isInactive=false&count=1&fields=*"),
    api("POST", "/customer", {
      name: "Eichenhof GmbH",
      organizationNumber: "986645888",
    }),
    api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
  ]);

  let deptId: number;
  if (deptRes.values && deptRes.values.length > 0) {
    deptId = deptRes.values[0].id;
  } else {
    const newDept = await api("POST", "/department", { name: "Avdeling" });
    deptId = newDept.value.id;
  }

  const customerId = custRes.value.id;
  const pmManagerId = pmRes.values[0].id;

  // ── Step 2: 2 employees + project (parallel, 3 calls) ──
  const [hannahRes, marieRes, projRes] = await Promise.all([
    api("POST", "/employee", {
      firstName: "Hannah",
      lastName: "Weber",
      email: "hannah.weber@example.org",
      dateOfBirth: "1985-01-15",
      userType: "NO_ACCESS",
      department: { id: deptId },
    }),
    api("POST", "/employee", {
      firstName: "Marie",
      lastName: "Fischer",
      email: "marie.fischer@example.org",
      dateOfBirth: "1987-06-20",
      userType: "NO_ACCESS",
      department: { id: deptId },
    }),
    api("POST", "/project", {
      name: "Cloud-Migration Eichenhof",
      startDate: TODAY,
      customer: { id: customerId },
      projectManager: { id: pmManagerId },
      isFixedPrice: true,
      fixedprice: 253000,
    }),
  ]);

  const hannahId = hannahRes.value.id;
  const marieId = marieRes.value.id;
  const projectId = projRes.value.id;

  // ── Step 3: projectActivity + 2 participants (parallel, 3 calls) ──
  const totalHours = 34 + 118; // 152
  const [actRes] = await Promise.all([
    api("POST", "/project/projectActivity", {
      project: { id: projectId },
      startDate: TODAY,
      budgetHours: totalHours,
      budgetFeeCurrency: 253000,
      activity: {
        name: "Prosjektaktivitet",
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: false,
      },
    }),
    // Hannah = Projektleiter → adminAccess: true
    api("POST", "/project/participant", {
      project: { id: projectId },
      employee: { id: hannahId },
      adminAccess: true,
    }),
    // Marie = Berater → adminAccess: false
    api("POST", "/project/participant", {
      project: { id: projectId },
      employee: { id: marieId },
      adminAccess: false,
    }),
  ]);

  const activityId = actRes.value.activity.id;

  // ── Step 4: timesheet batch + supplier + accounts + voucherType (parallel, 4 calls) ──
  const hannahEntries = splitHours(34, TODAY).map(e => ({
    employee: { id: hannahId },
    project: { id: projectId },
    activity: { id: activityId },
    date: e.date,
    hours: e.hours,
  }));
  const marieEntries = splitHours(118, TODAY).map(e => ({
    employee: { id: marieId },
    project: { id: projectId },
    activity: { id: activityId },
    date: e.date,
    hours: e.hours,
  }));
  const allEntries = [...hannahEntries, ...marieEntries];

  const [tsRes, suppRes, accRes, vtRes] = await Promise.all([
    api("POST", "/timesheet/entry/list", allEntries),
    api("POST", "/supplier", {
      name: "Silberberg GmbH",
      organizationNumber: "823323948",
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

  console.log(`Accounts: 1920=${acc1920?.id}, 6590=${acc6590?.id}, 2400=${acc2400?.id}`);
  console.log(`VoucherType: ${voucherTypeId}`);
  console.log(`Timesheet entries created: ${tsRes.values?.length}`);

  // ── Step 5: orderline + voucher + vatType (parallel, 3 calls) ──
  const [olRes, vchRes, vatRes] = await Promise.all([
    api("POST", "/project/orderline", {
      project: { id: projectId },
      description: "Leverandørkostnad fra Silberberg GmbH",
      date: TODAY,
      count: 1,
      unitCostCurrency: 47050,
      isChargeable: false,
    }),
    api("POST", "/ledger/voucher", {
      date: TODAY,
      description: "Leverandørkostnad fra Silberberg GmbH",
      voucherType: { id: voucherTypeId },
      postings: [
        {
          row: 1,
          date: TODAY,
          description: "Leverandørkostnad",
          account: { id: acc6590.id },
          amount: 47050,
          amountCurrency: 47050,
          amountGross: 47050,
          amountGrossCurrency: 47050,
          project: { id: projectId },
        },
        {
          row: 2,
          date: TODAY,
          description: "Leverandørgjeld",
          account: { id: acc2400.id },
          amount: -47050,
          amountCurrency: -47050,
          amountGross: -47050,
          amountGrossCurrency: -47050,
          supplier: { id: supplierId },
        },
      ],
    }),
    api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
  ]);

  console.log(`Orderline: ${olRes.value?.id}`);
  console.log(`Voucher: ${vchRes.value?.id}`);

  const vatTypes = vatRes.values as any[];
  const vat25 = vatTypes.find((v: any) => v.percentage === 25.0) || vatTypes[0];
  console.log(`VAT type: ${vat25.id} (${vat25.percentage}%)`);

  // ── Step 6: bank account fix if needed ──
  let bankFixed = false;
  if (acc1920 && !acc1920.bankAccountNumber) {
    console.log("Bank account 1920 needs bankAccountNumber fix");
    await api("PUT", `/ledger/account/${acc1920.id}`, {
      id: acc1920.id,
      number: acc1920.number,
      name: acc1920.name,
      bankAccountNumber: "12345678903",
    });
    bankFixed = true;
  }

  // ── Step 7: direct invoice ──
  const dueDate = "2026-04-05";
  const invoiceRes = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
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
            description: "Cloud-Migration Eichenhof",
            count: 1,
            unitPriceExcludingVatCurrency: 253000,
            vatType: { id: vat25.id },
          },
        ],
      },
    ],
  });

  console.log("\n=== RESULT ===");
  console.log(`Customer: ${customerId}`);
  console.log(`Employees: Hannah=${hannahId}, Marie=${marieId}`);
  console.log(`Project: ${projectId} (fixedprice=253000, isFixedPrice=true)`);
  console.log(`Activity: ${activityId} (budgetHours=${totalHours})`);
  console.log(`Supplier: ${supplierId}`);
  console.log(`Orderline: ${olRes.value?.id} (unitCostCurrency=47050)`);
  console.log(`Voucher: ${vchRes.value?.id}`);
  console.log(`Bank fix: ${bankFixed}`);
  console.log(`Invoice: ${invoiceRes.value?.id}`);
  console.log(`Invoice amount: ${invoiceRes.value?.amountExcludingVatCurrency}`);
  console.log(`Project invoice details: ${invoiceRes.value?.projectInvoiceDetails?.length}`);
  const totalCalls = 17 + (bankFixed ? 1 : 0);
  console.log(`Total API calls: ${totalCalls}`);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
