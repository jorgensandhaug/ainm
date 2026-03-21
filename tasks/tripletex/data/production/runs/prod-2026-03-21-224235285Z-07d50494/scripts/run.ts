const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "MCTXI-C9bBYiUh04dApXcNvpLYJ3sA7Pt9qXGhB07_g";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";
const DUE = "2026-04-04";

const HOURS = 16;
const RATE = 1300;
const TOTAL = HOURS * RATE; // 20800

const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!r.ok) {
    console.error(`${method} ${path} → ${r.status}`, JSON.stringify(json).slice(0, 500));
    throw new Error(`${r.status} on ${method} ${path}`);
  }
  console.log(`${method} ${path} → ${r.status}`);
  return json;
}

async function main() {
  // Step 1: 5 parallel (no deps)
  const [deptRes, custRes, pmRes, vatRes, accRes] = await Promise.all([
    api("GET", "/department?isInactive=false&count=1&fields=*"),
    api("POST", "/customer", { name: "Océan SARL", organizationNumber: "953748460" }),
    api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
    api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
    api("GET", "/ledger/account?number=1920&fields=id,number,name,isBankAccount,bankAccountNumber"),
  ]);

  const deptId = deptRes.values?.[0]?.id;
  if (!deptId) throw new Error("No department");
  const custId = custRes.value.id;
  const pmId = pmRes.values[0].id;
  const vatId = vatRes.values[0].id;
  const acc1920 = accRes.values?.find((a: any) => a.number === 1920);
  if (!acc1920) throw new Error("No account 1920");
  const bankNeedsRepair = !acc1920.bankAccountNumber;

  console.log(`dept=${deptId} cust=${custId} pm=${pmId} vat=${vatId} acc1920=${acc1920.id} bankRepair=${bankNeedsRepair}`);

  // Step 2: employee + project (parallel)
  const [empRes, projRes] = await Promise.all([
    api("POST", "/employee", {
      firstName: "Camille",
      lastName: "Dubois",
      email: "camille.dubois@example.org",
      dateOfBirth: "1985-01-15",
      userType: "NO_ACCESS",
      department: { id: deptId },
    }),
    api("POST", "/project", {
      name: "Mise à niveau système",
      startDate: TODAY,
      customer: { id: custId },
      projectManager: { id: pmId },
    }),
  ]);

  const empId = empRes.value.id;
  const projId = projRes.value.id;
  console.log(`emp=${empId} proj=${projId}`);

  // Step 3: activity + participant (parallel)
  const [actRes, _partRes] = await Promise.all([
    api("POST", "/project/projectActivity", {
      project: { id: projId },
      startDate: TODAY,
      budgetHours: HOURS,
      budgetFeeCurrency: TOTAL,
      activity: {
        name: "Design",
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: false,
      },
    }),
    api("POST", "/project/participant", {
      project: { id: projId },
      employee: { id: empId },
      adminAccess: false,
    }),
  ]);

  const activityId = actRes.value.activity.id;
  console.log(`activity=${activityId}`);

  // Step 4: timesheet — split 16h into 7.5 + 7.5 + 1.0 across consecutive dates
  const entries: any[] = [];
  let remaining = HOURS;
  let dayOffset = 0;
  while (remaining > 0) {
    const h = Math.min(remaining, 7.5);
    const d = new Date(Date.UTC(2026, 2, 21 + dayOffset)); // UTC-safe
    entries.push({
      employee: { id: empId },
      project: { id: projId },
      activity: { id: activityId },
      date: d.toISOString().slice(0, 10),
      hours: h,
    });
    remaining -= h;
    dayOffset++;
  }
  console.log("Timesheet:", entries.map(e => `${e.date}:${e.hours}h`).join(", "));

  const tsRes = await api("POST", "/timesheet/entry/list", entries);
  console.log("Timesheet entries created:", tsRes.values?.length);

  // Step 5: bank fix if needed
  if (bankNeedsRepair) {
    console.log("Repairing bank account 1920...");
    await api("PUT", `/ledger/account/${acc1920.id}`, {
      id: acc1920.id,
      number: acc1920.number,
      name: acc1920.name,
      bankAccountNumber: "12345678903",
    });
  }

  // Step 6: invoice
  const invoiceRes = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: DUE,
    customer: { id: custId },
    orders: [
      {
        customer: { id: custId },
        project: { id: projId },
        orderDate: TODAY,
        deliveryDate: TODAY,
        orderLines: [
          {
            description: "Design – 16 heures à 1300 NOK/h",
            count: HOURS,
            unitPriceExcludingVatCurrency: RATE,
            vatType: { id: vatId },
          },
        ],
      },
    ],
  });

  console.log("=== INVOICE ===");
  console.log("ID:", invoiceRes.value?.id);
  console.log("Number:", invoiceRes.value?.invoiceNumber);
  console.log("Amount excl VAT:", invoiceRes.value?.amountExcludingVatCurrency);
  console.log("Project invoice details:", invoiceRes.value?.projectInvoiceDetails?.length);
  console.log("DONE");
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
