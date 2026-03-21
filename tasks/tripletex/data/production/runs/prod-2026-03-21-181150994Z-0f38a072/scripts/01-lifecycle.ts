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

  // Step 1: GET department + GET division + POST customer (parallel)
  const [deptRes, divRes, custRes] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=*"),
    get("/division?count=1&fields=*"),
    post("/customer", {
      name: "Northwave Ltd",
      organizationNumber: "932075482",
      isCustomer: true,
    }),
  ]);

  const deptId = deptRes.values?.[0]?.id;
  const divId = divRes.values?.[0]?.id;
  const customerId = custRes.value.id;

  console.log("Customer:", customerId);
  console.log("Dept:", deptId, "Div:", divId);

  // If no department, create one
  let finalDeptId = deptId;
  if (!finalDeptId) {
    const deptCreate = await post("/department", { name: "Avdeling" });
    finalDeptId = deptCreate.value.id;
    console.log("Created dept:", finalDeptId);
  }

  // Build employment base
  const employmentBase: any = { startDate: TODAY };
  if (divId) employmentBase.division = { id: divId };

  // Step 2: POST employee Samuel Brown
  const emp1Res = await post("/employee", {
    firstName: "Samuel",
    lastName: "Brown",
    email: "samuel.brown@example.org",
    dateOfBirth: "1985-06-15",
    userType: "NO_ACCESS",
    department: { id: finalDeptId },
    employments: [{ ...employmentBase }],
  });
  const emp1Id = emp1Res.value.id;
  console.log("Employee 1 (Samuel Brown):", emp1Id);

  // Step 3: GET assignable project managers + POST employee Sarah Lewis (parallel)
  const [mgrRes, emp2Res] = await Promise.all([
    get("/employee?assignableProjectManagers=true&count=1&fields=*"),
    post("/employee", {
      firstName: "Sarah",
      lastName: "Lewis",
      email: "sarah.lewis@example.org",
      dateOfBirth: "1990-03-22",
      userType: "NO_ACCESS",
      department: { id: finalDeptId },
      employments: [{ ...employmentBase }],
    }),
  ]);
  const mgrId = mgrRes.values[0].id;
  const emp2Id = emp2Res.value.id;
  console.log("Manager:", mgrId, "Employee 2 (Sarah Lewis):", emp2Id);

  // Step 4: POST project
  const projRes = await post("/project", {
    name: "Cloud Migration Northwave",
    startDate: TODAY,
    customer: { id: customerId },
    projectManager: { id: mgrId },
  });
  const projectId = projRes.value.id;
  console.log("Project:", projectId);

  // Step 5: POST project activity with budget
  const actRes = await post("/project/projectActivity", {
    project: { id: projectId },
    startDate: TODAY,
    budgetFeeCurrency: 396900,
    activity: {
      name: "Prosjektaktivitet",
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
    },
    isChargeable: false,
  });
  const activityId = actRes.value.activity.id;
  console.log("Activity:", activityId, "Budget:", actRes.value.budgetFeeCurrency);

  // Step 6: Build timesheet entries for both employees + POST supplier (parallel)
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

  // Step 7: POST project/orderline + GET vatType + GET bank account (parallel)
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

  // Find bank account, fix if needed
  let bankAccount = bankRes.values[0];
  console.log("Bank account:", bankAccount.id, "number:", bankAccount.bankAccountNumber);

  // Step 8: fix bank account if no bankAccountNumber
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
