const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "A6Awp_AdMLqcNn6fOjS_KkaFZFeFm1X4YWDjmn6YgJI";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

const h = { "Content-Type": "application/json", Authorization: AUTH };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const txt = await r.text();
  if (!r.ok) throw new Error(`POST ${path} → ${r.status} ${txt}`);
  return JSON.parse(txt);
}

async function put(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, body: JSON.stringify(body) });
  const txt = await r.text();
  if (!r.ok) throw new Error(`PUT ${path} → ${r.status} ${txt}`);
  return JSON.parse(txt);
}

function splitHours(total: number, startDate: string): { date: string; hours: number }[] {
  const [y, m, d] = startDate.split("-").map(Number);
  const entries: { date: string; hours: number }[] = [];
  let remaining = total;
  let offset = 0;
  while (remaining > 0) {
    const chunk = Math.min(remaining, 24);
    const dt = new Date(Date.UTC(y, m - 1, d + offset));
    entries.push({ date: dt.toISOString().slice(0, 10), hours: chunk });
    remaining -= chunk;
    offset++;
  }
  return entries;
}

async function main() {
  // Step 1: GET department + GET division + POST customer (parallel)
  const [deptRes, divRes, custRes] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=*"),
    get("/division?count=1&fields=*"),
    post("/customer", {
      name: "Elvdal AS",
      organizationNumber: "894208848",
    }),
  ]);

  const deptId = deptRes.values?.[0]?.id;
  if (!deptId) throw new Error("No department found — would need POST /department");
  const divId = divRes.values?.[0]?.id; // may be undefined if empty

  const customerId = custRes.value.id;
  console.log("Step 1: dept=" + deptId + " div=" + divId + " customer=" + customerId);

  // Build employment object conditionally
  const makeEmployment = () => {
    const emp: any = { startDate: TODAY };
    if (divId) emp.division = { id: divId };
    return emp;
  };

  // Step 2: POST /employee for Knut Brekke
  const emp1Res = await post("/employee", {
    firstName: "Knut",
    lastName: "Brekke",
    email: "knut.brekke@example.org",
    dateOfBirth: "1985-01-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [makeEmployment()],
  });
  const emp1Id = emp1Res.value.id;
  console.log("Step 2: emp1 (Knut)=" + emp1Id);

  // Step 3: GET assignable PM + POST /employee for Svein Aasen (parallel)
  const [mgrRes, emp2Res] = await Promise.all([
    get("/employee?assignableProjectManagers=true&count=1&fields=*"),
    post("/employee", {
      firstName: "Svein",
      lastName: "Aasen",
      email: "svein.aasen@example.org",
      dateOfBirth: "1985-01-15",
      userType: "NO_ACCESS",
      department: { id: deptId },
      employments: [makeEmployment()],
    }),
  ]);
  const mgrId = mgrRes.values[0].id;
  const emp2Id = emp2Res.value.id;
  console.log("Step 3: mgr=" + mgrId + " emp2 (Svein)=" + emp2Id);

  // Step 4: POST /project
  const projRes = await post("/project", {
    name: "Dataplattform Elvdal",
    startDate: TODAY,
    customer: { id: customerId },
    projectManager: { id: mgrId },
  });
  const projectId = projRes.value.id;
  console.log("Step 4: project=" + projectId);

  // Step 5: POST /project/projectActivity + POST /project/participant x2 (parallel)
  const [actRes, part1Res, part2Res] = await Promise.all([
    post("/project/projectActivity", {
      project: { id: projectId },
      startDate: TODAY,
      budgetFeeCurrency: 331100,
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
  console.log("Step 5: activity=" + activityId + " budget=" + actRes.value.budgetFeeCurrency + " part1=" + part1Res.value.id + " part2=" + part2Res.value.id);

  // Prepare timesheet entries
  const knutEntries = splitHours(43, TODAY).map(e => ({
    employee: { id: emp1Id },
    project: { id: projectId },
    activity: { id: activityId },
    date: e.date,
    hours: e.hours,
  }));
  const sveinEntries = splitHours(100, TODAY).map(e => ({
    employee: { id: emp2Id },
    project: { id: projectId },
    activity: { id: activityId },
    date: e.date,
    hours: e.hours,
  }));
  const allEntries = [...knutEntries, ...sveinEntries];

  // Step 6: POST /timesheet/entry/list + POST /supplier + GET accounts + GET voucherType (parallel)
  const [tsRes, suppRes, accRes, vtRes] = await Promise.all([
    post("/timesheet/entry/list", allEntries),
    post("/supplier", {
      name: "Fossekraft AS",
      organizationNumber: "979871783",
    }),
    get("/ledger/account?number=6590,2400&fields=id,number,name"),
    get("/ledger/voucherType?name=Leverand%C3%B8rfaktura&count=1&fields=id,name"),
  ]);
  const suppId = suppRes.value.id;
  console.log("Step 6: timesheet=" + tsRes.values.length + " entries, supplier=" + suppId);

  const acc6590 = accRes.values.find((a: any) => a.number === 6590);
  const acc2400 = accRes.values.find((a: any) => a.number === 2400);
  if (!acc6590 || !acc2400) throw new Error("Missing accounts 6590/2400");
  const voucherTypeId = vtRes.values[0].id;
  console.log("Step 6: acc6590=" + acc6590.id + " acc2400=" + acc2400.id + " voucherType=" + voucherTypeId);

  // Step 7: POST /ledger/voucher + GET vatType + GET bank account (parallel)
  const [vouchRes, vatRes, bankRes] = await Promise.all([
    post("/ledger/voucher", {
      date: TODAY,
      description: "Leverandørkostnad frå Fossekraft AS",
      voucherType: { id: voucherTypeId },
      postings: [
        {
          row: 1,
          date: TODAY,
          description: "Leverandørkostnad",
          account: { id: acc6590.id },
          amount: 61650,
          amountCurrency: 61650,
          amountGross: 61650,
          amountGrossCurrency: 61650,
          project: { id: projectId },
        },
        {
          row: 2,
          date: TODAY,
          description: "Leverandørgjeld",
          account: { id: acc2400.id },
          amount: -61650,
          amountCurrency: -61650,
          amountGross: -61650,
          amountGrossCurrency: -61650,
          supplier: { id: suppId },
        },
      ],
    }),
    get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=" + TODAY + "&fields=*"),
    get("/ledger/account?isBankAccount=true&fields=*"),
  ]);
  console.log("Step 7: voucher=" + vouchRes.value.id);

  const vatType = vatRes.values.find((v: any) => v.percentage > 0) || vatRes.values[0];
  console.log("Step 7: vatType=" + vatType.id + " (" + vatType.name + " " + vatType.percentage + "%)");

  // Step 8: Check bank account
  const bankAcct = bankRes.values.find((a: any) => a.bankAccountNumber) || bankRes.values[0];
  let bankFixNeeded = false;
  if (!bankAcct.bankAccountNumber) {
    console.log("Step 8: Bank account " + bankAcct.id + " needs bankAccountNumber fix");
    await put("/ledger/account/" + bankAcct.id, {
      id: bankAcct.id,
      name: bankAcct.name,
      number: bankAcct.number,
      bankAccountNumber: "12345678903",
    });
    bankFixNeeded = true;
    console.log("Step 8: Bank account fixed");
  } else {
    console.log("Step 8: Bank account OK (" + bankAcct.id + ")");
  }

  // Step 9: POST /invoice?sendToCustomer=false
  const lastTsDate = sveinEntries[sveinEntries.length - 1].date;
  const dueDate = new Date(Date.UTC(2026, 3 - 1, 21 + 14)).toISOString().slice(0, 10); // 2 weeks out
  const invoiceRes = await post("/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: dueDate,
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        project: { id: projectId },
        orderDate: TODAY,
        deliveryDate: lastTsDate,
        orderLines: [
          {
            description: "Dataplattform Elvdal",
            count: 1,
            unitPriceExcludingVatCurrency: 331100,
            vatType: { id: vatType.id },
          },
        ],
      },
    ],
  });
  console.log("Step 9: invoice=" + invoiceRes.value.id + " number=" + invoiceRes.value.invoiceNumber);
  console.log("  amountExcludingVat=" + invoiceRes.value.amountExcludingVatCurrency);
  console.log("  projectInvoiceDetails=" + invoiceRes.value.projectInvoiceDetails?.length);

  console.log("\n=== DONE ===");
  console.log("Customer: " + customerId + " (Elvdal AS)");
  console.log("Employee 1: " + emp1Id + " (Knut Brekke, 43h)");
  console.log("Employee 2: " + emp2Id + " (Svein Aasen, 100h)");
  console.log("Project: " + projectId + " (Dataplattform Elvdal, budget 331100)");
  console.log("Activity: " + activityId);
  console.log("Supplier: " + suppId + " (Fossekraft AS)");
  console.log("Voucher: " + vouchRes.value.id + " (cost 61650)");
  console.log("Invoice: " + invoiceRes.value.id + " (#" + invoiceRes.value.invoiceNumber + ")");
  console.log("Total API calls: " + (bankFixNeeded ? 19 : 18));
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
