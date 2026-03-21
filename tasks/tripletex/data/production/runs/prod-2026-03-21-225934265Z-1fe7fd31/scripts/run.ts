const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "jm2ej-4cHVKHDCjhXpodmHiSSB-K31z9Vc1GFP4V37Y";
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
    console.error(`${method} ${path} → ${r.status}`, JSON.stringify(json).slice(0, 500));
    throw new Error(`${r.status} ${method} ${path}`);
  }
  console.log(`${method} ${path} → ${r.status}`);
  return json;
}

// ── Step 1: parallel — department, customer, assignable PM ──
const [deptRes, custRes, pmRes] = await Promise.all([
  api("GET", "/department?isInactive=false&count=1&fields=*"),
  api("POST", "/customer", {
    name: "Sonnental GmbH",
    organizationNumber: "839389701",
    invoiceEmail: "invoice@sonnental.example.org",
  }),
  api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
]);

let deptId: number;
if (deptRes.count > 0) {
  deptId = deptRes.values[0].id;
} else {
  const d = await api("POST", "/department", { name: "Avdeling" });
  deptId = d.value.id;
}
const customerId = custRes.value.id;
const pmId = pmRes.values[0].id;
console.log(`dept=${deptId} customer=${customerId} pm=${pmId}`);

// ── Step 2: parallel — employee + project ──
const totalHours = 33;
const rate = 900;
const budget = totalHours * rate; // 29700

const [empRes, projRes] = await Promise.all([
  api("POST", "/employee", {
    firstName: "Paul",
    lastName: "Müller",
    email: "paul.muller@example.org",
    dateOfBirth: "1985-01-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
  }),
  api("POST", "/project", {
    name: "Datenmigration",
    startDate: TODAY,
    customer: { id: customerId },
    projectManager: { id: pmId },
    isFixedPrice: true,
    fixedprice: budget,
  }),
]);

const empId = empRes.value.id;
const projectId = projRes.value.id;
console.log(`emp=${empId} project=${projectId}`);

// ── Step 3: parallel — project activity + participant ──
const [actRes, _partRes] = await Promise.all([
  api("POST", "/project/projectActivity", {
    project: { id: projectId },
    startDate: TODAY,
    budgetHours: totalHours,
    budgetFeeCurrency: budget,
    activity: {
      name: "Testing",
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: false,
    },
  }),
  api("POST", "/project/participant", {
    project: { id: projectId },
    employee: { id: empId },
    adminAccess: true,
  }),
]);

const activityId = actRes.value.activity.id;
console.log(`activity=${activityId}`);

// ── Step 4: parallel — timesheet batch + vatType + account 1920 ──
// Split 33 hours: 24h on day 1, 9h on day 2
function splitHours(total: number, startDate: string): { date: string; hours: number }[] {
  const entries: { date: string; hours: number }[] = [];
  const [y, m, d] = startDate.split("-").map(Number);
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

const chunks = splitHours(totalHours, TODAY);
const tsEntries = chunks.map(c => ({
  employee: { id: empId },
  project: { id: projectId },
  activity: { id: activityId },
  date: c.date,
  hours: c.hours,
}));

const [tsRes, vatRes, accRes] = await Promise.all([
  api("POST", "/timesheet/entry/list", tsEntries),
  api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
  api("GET", "/ledger/account?number=1920&fields=id,number,name,isBankAccount,bankAccountNumber"),
]);

console.log(`timesheet entries=${tsRes.count}`);

// Pick first outgoing VAT type
const vatTypeId = vatRes.values[0].id;
console.log(`vatType=${vatTypeId}`);

// Check bank account
let bankAcc = accRes.values?.find((a: any) => a.number === 1920);
let bankAccId: number | undefined;
if (bankAcc) {
  bankAccId = bankAcc.id;
  if (!bankAcc.bankAccountNumber) {
    console.log("Bank account 1920 needs bankAccountNumber fix");
    await api("PUT", `/ledger/account/${bankAccId}`, {
      id: bankAccId,
      number: bankAcc.number,
      name: bankAcc.name,
      bankAccountNumber: "12345678903",
    });
  }
} else {
  // Fallback: find any bank account
  const bankRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
  bankAcc = bankRes.values?.find((a: any) => a.bankAccountNumber) || bankRes.values?.[0];
  bankAccId = bankAcc?.id;
  if (bankAcc && !bankAcc.bankAccountNumber) {
    await api("PUT", `/ledger/account/${bankAccId}`, {
      id: bankAccId,
      number: bankAcc.number,
      name: bankAcc.name,
      bankAccountNumber: "12345678903",
    });
  }
}

// ── Step 5: direct invoice ──
const invoiceRes = await api("POST", "/invoice?sendToCustomer=false", {
  invoiceDate: TODAY,
  invoiceDueDate: "2026-04-05",
  customer: { id: customerId },
  orders: [
    {
      customer: { id: customerId },
      project: { id: projectId },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [
        {
          description: "Testing – Datenmigration (33h × 900 NOK)",
          count: totalHours,
          unitPriceExcludingVatCurrency: rate,
          vatType: { id: vatTypeId },
        },
      ],
    },
  ],
});

console.log("Invoice created:", invoiceRes.value?.id, "amount:", invoiceRes.value?.amountExcludingVatCurrency);
console.log("Done.");
