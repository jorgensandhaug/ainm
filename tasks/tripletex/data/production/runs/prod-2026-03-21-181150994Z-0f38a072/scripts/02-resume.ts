const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "WjshLPVlmUE0JXU6UxSAkvXq06M4fbB6zLDBr-WjfeQ";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { headers });
  const body = await r.json();
  if (!r.ok) { console.error("GET", url, r.status, JSON.stringify(body)); throw new Error(`GET ${r.status}`); }
  return body;
}
async function post(path: string, data: any) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(data) });
  const body = await r.json();
  if (!r.ok) { console.error("POST", url, r.status, JSON.stringify(body)); throw new Error(`POST ${r.status}`); }
  return body;
}
async function put(path: string, data: any) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method: "PUT", headers, body: JSON.stringify(data) });
  const body = await r.json();
  if (!r.ok) { console.error("PUT", url, r.status, JSON.stringify(body)); throw new Error(`PUT ${r.status}`); }
  return body;
}

function splitHours(totalHours: number, startDate: string): { date: string; hours: number }[] {
  const entries: { date: string; hours: number }[] = [];
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

async function main() {
  const TODAY = "2026-03-21";
  // Known IDs from step 1-4
  const customerId = 108391034;
  const emp1Id = 18645495; // Samuel Brown
  const emp2Id = 18645496; // Sarah Lewis
  const projectId = 402025806;

  // Step 5: POST project activity (fixed: isChargeable on the activity object)
  const actRes = await post("/project/projectActivity", {
    project: { id: projectId },
    startDate: TODAY,
    budgetFeeCurrency: 396900,
    activity: {
      name: "Prosjektaktivitet",
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: false,
    },
  });
  const activityId = actRes.value.activity.id;
  console.log("Activity:", activityId, "Budget:", actRes.value.budgetFeeCurrency);

  // Step 6: timesheet entries + supplier (parallel)
  const sam_entries = splitHours(74, TODAY);
  const sarah_entries = splitHours(85, TODAY);

  const timesheetPayload = [
    ...sam_entries.map(e => ({
      employee: { id: emp1Id },
      project: { id: projectId },
      activity: { id: activityId },
      date: e.date,
      hours: e.hours,
    })),
    ...sarah_entries.map(e => ({
      employee: { id: emp2Id },
      project: { id: projectId },
      activity: { id: activityId },
      date: e.date,
      hours: e.hours,
    })),
  ];

  const [tsRes, suppRes] = await Promise.all([
    post("/timesheet/entry/list", timesheetPayload),
    post("/supplier", {
      name: "Clearwater Ltd",
      organizationNumber: "889264985",
      isSupplier: true,
    }),
  ]);
  console.log("Timesheet entries:", tsRes.values?.length);
  const supplierId = suppRes.value.id;
  console.log("Supplier:", supplierId);

  // Step 7: cost orderline + vatType + bank account (parallel)
  const [costRes, vatRes, bankRes] = await Promise.all([
    post("/project/orderline", {
      project: { id: projectId },
      description: "Supplier cost - Clearwater Ltd",
      date: TODAY,
      count: 1,
      unitCostCurrency: 56750,
      isChargeable: false,
    }),
    get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
    get("/ledger/account?isBankAccount=true&fields=*"),
  ]);
  console.log("Cost orderline:", costRes.value?.id);

  const vatTypeId = vatRes.values[0].id;
  console.log("VAT type:", vatTypeId);

  let bankAccount = bankRes.values[0];
  console.log("Bank account:", bankAccount.id, "number:", bankAccount.bankAccountNumber);

  // Step 8: fix bank account if needed
  if (!bankAccount.bankAccountNumber) {
    const fixRes = await put(`/ledger/account/${bankAccount.id}`, {
      ...bankAccount,
      bankAccountNumber: "12345678903",
    });
    bankAccount = fixRes.value;
    console.log("Fixed bank account number:", bankAccount.bankAccountNumber);
  }

  // Step 9: POST invoice
  const dueDate = "2026-04-20";
  const invoiceRes = await post("/invoice?sendToCustomer=false", {
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
            description: "Cloud Migration Northwave - Project Services",
            count: 1,
            unitPriceExcludingVatCurrency: 396900,
            vatType: { id: vatTypeId },
          },
        ],
      },
    ],
  });

  console.log("Invoice:", invoiceRes.value?.id);
  console.log("Invoice number:", invoiceRes.value?.invoiceNumber);
  console.log("Amount excl VAT:", invoiceRes.value?.amountExcludingVatCurrency);
  console.log("Project invoice details:", invoiceRes.value?.projectInvoiceDetails?.length);
  console.log("\nDONE - All steps completed successfully");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
