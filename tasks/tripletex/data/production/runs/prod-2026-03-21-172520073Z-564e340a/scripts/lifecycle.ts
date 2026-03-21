const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "ah1WCnS2XY6allbXaYJRUf_zMNZ3uVYIZ9Zbe0HBc64";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const TODAY = "2026-03-21";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) {
    console.error(`${method} ${path} => ${res.status}`, JSON.stringify(json, null, 2));
    throw new Error(`${method} ${path} failed: ${res.status}`);
  }
  console.log(`${method} ${path} => ${res.status}`);
  return json;
}

async function main() {
  // Step 1: parallel — GET department, GET division, POST customer
  const [deptRes, divRes, custRes] = await Promise.all([
    api("GET", "/department?isInactive=false&count=1&fields=*"),
    api("GET", "/division?count=1&fields=*"),
    api("POST", "/customer", {
      name: "Horizonte Lda",
      organizationNumber: "857400526",
      isCustomer: true,
    }),
  ]);

  // Handle missing department
  let deptId = deptRes.values?.[0]?.id;
  if (!deptId) {
    console.log("No department found, creating one...");
    const newDept = await api("POST", "/department", { name: "Avdeling" });
    deptId = newDept.value.id;
  }

  const divId = divRes.values?.[0]?.id;
  const customerId = custRes.value.id;
  console.log(`Customer: ${customerId}, Dept: ${deptId}, Div: ${divId ?? "none"}`);

  // Employment builder — conditionally include division
  const makeEmployment = (startDate: string) => {
    const emp: any = { startDate };
    if (divId) emp.division = { id: divId };
    return emp;
  };

  // Step 2: POST first employee (Catarina Martins)
  const emp1Res = await api("POST", "/employee", {
    firstName: "Catarina",
    lastName: "Martins",
    email: "catarina.martins@example.org",
    userType: "NO_ACCESS",
    dateOfBirth: "1990-01-15",
    department: { id: deptId },
    employments: [makeEmployment(TODAY)],
  });
  const emp1Id = emp1Res.value.id;
  console.log(`Employee 1 (Catarina): ${emp1Id}`);

  // Step 3: parallel — GET assignable managers, POST second employee (João)
  const [mgrRes, emp2Res] = await Promise.all([
    api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
    api("POST", "/employee", {
      firstName: "João",
      lastName: "Martins",
      email: "joao.martins@example.org",
      userType: "NO_ACCESS",
      dateOfBirth: "1992-06-20",
      department: { id: deptId },
      employments: [makeEmployment(TODAY)],
    }),
  ]);
  const managerId = mgrRes.values[0].id;
  const emp2Id = emp2Res.value.id;
  console.log(`Manager: ${managerId}, Employee 2 (João): ${emp2Id}`);

  // Step 4: POST project
  const projRes = await api("POST", "/project", {
    name: "Migração Cloud Horizonte",
    startDate: TODAY,
    customer: { id: customerId },
    projectManager: { id: managerId },
  });
  const projectId = projRes.value.id;
  console.log(`Project: ${projectId}`);

  // Step 5: POST project activity with budget
  const actRes = await api("POST", "/project/projectActivity", {
    project: { id: projectId },
    startDate: TODAY,
    budgetFeeCurrency: 229500,
    activity: {
      name: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: false,
    },
  });
  const activityId = actRes.value.activity.id;
  console.log(`Activity: ${activityId}, Budget: ${actRes.value.budgetFeeCurrency}`);

  // Step 6: parallel — POST timesheet batch + POST supplier
  // Split: Catarina 37h → [24, 13], João 62h → [24, 24, 14]
  const timesheetEntries = [
    { employee: { id: emp1Id }, activity: { id: activityId }, project: { id: projectId }, date: "2026-03-21", hours: 24 },
    { employee: { id: emp1Id }, activity: { id: activityId }, project: { id: projectId }, date: "2026-03-22", hours: 13 },
    { employee: { id: emp2Id }, activity: { id: activityId }, project: { id: projectId }, date: "2026-03-21", hours: 24 },
    { employee: { id: emp2Id }, activity: { id: activityId }, project: { id: projectId }, date: "2026-03-22", hours: 24 },
    { employee: { id: emp2Id }, activity: { id: activityId }, project: { id: projectId }, date: "2026-03-23", hours: 14 },
  ];

  const [tsRes, supplierRes] = await Promise.all([
    api("POST", "/timesheet/entry/list", timesheetEntries),
    api("POST", "/supplier", {
      name: "Oceano Lda",
      organizationNumber: "941830420",
      isSupplier: true,
    }),
  ]);
  const supplierId = supplierRes.value.id;
  console.log(`Supplier: ${supplierId}`);

  // Verify timesheet totals
  if (Array.isArray(tsRes.values)) {
    const totalEmp1 = tsRes.values.filter((e: any) => e.employee?.id === emp1Id).reduce((s: number, e: any) => s + e.hours, 0);
    const totalEmp2 = tsRes.values.filter((e: any) => e.employee?.id === emp2Id).reduce((s: number, e: any) => s + e.hours, 0);
    console.log(`Timesheet totals — Catarina: ${totalEmp1}h, João: ${totalEmp2}h`);
  }

  // Step 7: parallel — POST project/orderline (cost), GET vatType, GET bank account
  const [costRes, vatRes, bankRes] = await Promise.all([
    api("POST", "/project/orderline", {
      project: { id: projectId },
      description: "Custo fornecedor Oceano Lda",
      date: TODAY,
      count: 1,
      unitCostCurrency: 56300,
      isChargeable: false,
    }),
    api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
    api("GET", "/ledger/account?isBankAccount=true&fields=*"),
  ]);

  const vatTypeId = vatRes.values[0].id;
  console.log(`Cost row: ${costRes.value.id}, VAT Type: ${vatTypeId}`);

  // Step 8: if bank account lacks bankAccountNumber, PUT to add it
  const bankAccount = bankRes.values[0];
  console.log(`Bank account: ${bankAccount.id}, number: ${bankAccount.bankAccountNumber ?? "MISSING"}`);

  if (!bankAccount.bankAccountNumber) {
    console.log("Repairing bank account with MOD11-valid number...");
    await api("PUT", `/ledger/account/${bankAccount.id}`, {
      ...bankAccount,
      bankAccountNumber: "12345678903",
    });
  }

  // Step 9: POST invoice (unsent)
  const invoiceRes = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: "2026-04-20",
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      project: { id: projectId },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: "Migração Cloud Horizonte — Serviços de projeto",
        count: 1,
        unitPriceExcludingVatCurrency: 229500,
        vatType: { id: vatTypeId },
      }],
    }],
  });

  console.log("\n=== INVOICE CREATED ===");
  console.log(`Invoice ID: ${invoiceRes.value.id}`);
  console.log(`Invoice Number: ${invoiceRes.value.invoiceNumber}`);
  console.log(`Amount excl. VAT: ${invoiceRes.value.amountExcludingVatCurrency}`);
  console.log(`Project Invoice Details: ${JSON.stringify(invoiceRes.value.projectInvoiceDetails)}`);
  console.log("\nDone — all steps completed.");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
