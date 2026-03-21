const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "6lfj_CH5oM2lJO406IzMMerYLSb-yk_ZdJ0eZ_7bw4E";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

const h = { "Content-Type": "application/json", Authorization: AUTH };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  if (!r.ok) { console.error("GET", path, r.status, JSON.stringify(b)); throw new Error(`GET ${path} ${r.status}`); }
  return b;
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) { console.error("POST", path, r.status, JSON.stringify(b)); throw new Error(`POST ${path} ${r.status}`); }
  return b;
}
async function put(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) { console.error("PUT", path, r.status, JSON.stringify(b)); throw new Error(`PUT ${path} ${r.status}`); }
  return b;
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
    get("/department?isInactive=false&count=1&fields=*"),
    get("/division?count=1&fields=*"),
    post("/customer", {
      name: "Snøhetta AS",
      organizationNumber: "954447499",
      isCustomer: true,
    }),
  ]);

  const deptId = deptRes.values?.[0]?.id;
  const divId = divRes.values?.[0]?.id;
  const customerId = custRes.value.id;
  console.log("customer:", customerId, "dept:", deptId, "div:", divId);

  if (!deptId) throw new Error("No department found");

  const makeEmployment = (startDate: string) => {
    const emp: any = { startDate, employmentType: "ORDINARY", percentageOfFullTimeEquivalent: 100 };
    if (divId) emp.division = { id: divId };
    return emp;
  };

  // Step 2: POST employee 1 (Sigurd Johansen)
  const emp1Res = await post("/employee", {
    firstName: "Sigurd",
    lastName: "Johansen",
    email: "sigurd.johansen@example.org",
    dateOfBirth: "1985-06-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [makeEmployment(TODAY)],
  });
  const emp1Id = emp1Res.value.id;
  console.log("employee1:", emp1Id);

  // Step 3: GET assignable PM + POST employee 2 (Erik Haugen) (parallel)
  const [pmRes, emp2Res] = await Promise.all([
    get("/employee?assignableProjectManagers=true&count=1&fields=*"),
    post("/employee", {
      firstName: "Erik",
      lastName: "Haugen",
      email: "erik.haugen@example.org",
      dateOfBirth: "1990-03-22",
      userType: "NO_ACCESS",
      department: { id: deptId },
      employments: [makeEmployment(TODAY)],
    }),
  ]);
  const pmId = pmRes.values[0].id;
  const emp2Id = emp2Res.value.id;
  console.log("pm:", pmId, "employee2:", emp2Id);

  // Step 4: POST project
  const projRes = await post("/project", {
    name: "ERP-implementering Snøhetta",
    startDate: TODAY,
    customer: { id: customerId },
    projectManager: { id: pmId },
  });
  const projectId = projRes.value.id;
  console.log("project:", projectId);

  // Step 5: POST projectActivity + POST participant x2 (parallel)
  const [actRes, part1Res, part2Res] = await Promise.all([
    post("/project/projectActivity", {
      project: { id: projectId },
      startDate: TODAY,
      budgetFeeCurrency: 431600,
      activity: {
        name: "Prosjektaktivitet",
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: false,
      },
    }),
    post("/project/participant", {
      project: { id: projectId },
      employee: { id: emp1Id },
      adminAccess: false,
    }),
    post("/project/participant", {
      project: { id: projectId },
      employee: { id: emp2Id },
      adminAccess: false,
    }),
  ]);
  const activityId = actRes.value.activity.id;
  console.log("activity:", activityId, "budget:", actRes.value.budgetFeeCurrency);
  console.log("participant1:", part1Res.value.id, "participant2:", part2Res.value.id);

  // Step 6: POST timesheet/entry/list + POST supplier + GET accounts (parallel)
  const entries1 = splitHours(47, TODAY).map((e) => ({
    employee: { id: emp1Id },
    project: { id: projectId },
    activity: { id: activityId },
    date: e.date,
    hours: e.hours,
  }));
  const entries2 = splitHours(46, TODAY).map((e) => ({
    employee: { id: emp2Id },
    project: { id: projectId },
    activity: { id: activityId },
    date: e.date,
    hours: e.hours,
  }));

  const [tsRes, suppRes, accRes] = await Promise.all([
    post("/timesheet/entry/list", [...entries1, ...entries2]),
    post("/supplier", {
      name: "Nordhav AS",
      organizationNumber: "957929974",
      isSupplier: true,
    }),
    get("/ledger/account?number=6590,2400&fields=id,number,name"),
  ]);
  const suppId = suppRes.value.id;
  console.log("supplier:", suppId);
  console.log("timesheet entries:", tsRes.values?.length);

  const acc6590 = accRes.values.find((a: any) => a.number === 6590);
  const acc2400 = accRes.values.find((a: any) => a.number === 2400);
  if (!acc6590 || !acc2400) throw new Error("Missing accounts 6590 or 2400");
  console.log("acc6590:", acc6590.id, "acc2400:", acc2400.id);

  // Step 7: POST voucher + GET vatType + GET bank account (parallel)
  const [voucherRes, vatRes, bankRes] = await Promise.all([
    post("/ledger/voucher", {
      voucherType: { id: 9744845 },
      date: TODAY,
      description: "Leverandørkostnad Nordhav AS",
      postings: [
        {
          account: { id: acc6590.id },
          amount: 95050,
          amountCurrency: 95050,
          amountGross: 95050,
          amountGrossCurrency: 95050,
          project: { id: projectId },
          date: TODAY,
          description: "Leverandørkostnad Nordhav AS",
        },
        {
          account: { id: acc2400.id },
          amount: -95050,
          amountCurrency: -95050,
          amountGross: -95050,
          amountGrossCurrency: -95050,
          supplier: { id: suppId },
          date: TODAY,
          description: "Leverandørkostnad Nordhav AS",
        },
      ],
    }),
    get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
    get("/ledger/account?isBankAccount=true&fields=*"),
  ]);
  console.log("voucher:", voucherRes.value.id);

  const vatType = vatRes.values.find((v: any) => v.percentage === 25) || vatRes.values[0];
  console.log("vatType:", vatType.id, vatType.percentage);

  let bankAcct = bankRes.values.find((a: any) => a.bankAccountNumber) || bankRes.values[0];
  console.log("bankAcct:", bankAcct.id, "bankAccountNumber:", bankAcct.bankAccountNumber);

  // Step 8: if bank account lacks bankAccountNumber, PUT it
  if (!bankAcct.bankAccountNumber) {
    const fixRes = await put(`/ledger/account/${bankAcct.id}`, {
      ...bankAcct,
      bankAccountNumber: "12345678903",
    });
    bankAcct = fixRes.value;
    console.log("fixed bankAcct:", bankAcct.id, bankAcct.bankAccountNumber);
  }

  // Step 9: POST invoice
  const dueDate = new Date(Date.UTC(2026, 2, 21 + 30)).toISOString().slice(0, 10);
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
            description: "ERP-implementering Snøhetta",
            count: 1,
            unitPriceExcludingVatCurrency: 431600,
            vatType: { id: vatType.id },
          },
        ],
      },
    ],
  });
  console.log("invoice:", invoiceRes.value.id, "number:", invoiceRes.value.invoiceNumber);
  console.log("amountExcludingVat:", invoiceRes.value.amountExcludingVatCurrency);
  console.log("projectInvoiceDetails:", invoiceRes.value.projectInvoiceDetails?.length);
  console.log("DONE");
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
