const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "0hPsgxjWKjFmkUAkBkzPBL1htOhfVavdvLNv2ppGtbo";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (r.status >= 400) {
    console.log("ERROR:", JSON.stringify(json).slice(0, 500));
    throw new Error(`${method} ${path} ${r.status}`);
  }
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

// Known IDs from previous successful calls
const customerId = 108370935;
const emp1Id = 18636160; // Hannah
const emp2Id = 18636162; // Marie
const projectId = 402015968;
const activityId = 5906154;
// supplier already created in previous run

// Generate date strings without Date object timezone issues
function addDays(base: string, n: number): string {
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function splitHours(total: number, startDate: string): { date: string; hours: number }[] {
  const chunks: { date: string; hours: number }[] = [];
  let remaining = total;
  let dayOffset = 0;
  while (remaining > 0) {
    const h = Math.min(remaining, 7.5);
    chunks.push({ date: addDays(startDate, dayOffset), hours: h });
    remaining = +(remaining - h).toFixed(2);
    dayOffset++;
  }
  return chunks;
}

const hannahChunks = splitHours(34, TODAY);
const marieChunks = splitHours(118, TODAY);

console.log("Hannah chunks:", hannahChunks.length, hannahChunks);
console.log("Marie chunks:", marieChunks.length, marieChunks);

// Check for duplicates within each employee
const hannahDates = hannahChunks.map(c => c.date);
const marieDates = marieChunks.map(c => c.date);
console.log("Hannah unique dates:", new Set(hannahDates).size, "total:", hannahDates.length);
console.log("Marie unique dates:", new Set(marieDates).size, "total:", marieDates.length);

const timesheetEntries = [
  ...hannahChunks.map(c => ({
    employee: { id: emp1Id },
    project: { id: projectId },
    activity: { id: activityId },
    date: c.date,
    hours: c.hours,
  })),
  ...marieChunks.map(c => ({
    employee: { id: emp2Id },
    project: { id: projectId },
    activity: { id: activityId },
    date: c.date,
    hours: c.hours,
  })),
];

console.log("Total entries:", timesheetEntries.length);

// Try timesheet batch
const tsEntries = await api("POST", "/timesheet/entry/list", timesheetEntries);
console.log("timesheet entries created:", tsEntries.length);

const totalHannah = tsEntries.filter((e: any) => e.employee?.id === emp1Id).reduce((s: number, e: any) => s + e.hours, 0);
const totalMarie = tsEntries.filter((e: any) => e.employee?.id === emp2Id).reduce((s: number, e: any) => s + e.hours, 0);
console.log("Hannah hours:", totalHannah, "Marie hours:", totalMarie);

// Step 7: POST project/orderline + GET vatType + GET bank account (parallel)
const [costLine, vatTypes, bankAccounts] = await Promise.all([
  api("POST", "/project/orderline", {
    project: { id: projectId },
    description: "Lieferantenkosten Silberberg GmbH",
    date: TODAY,
    count: 1,
    unitCostCurrency: 47050,
    isChargeable: false,
  }),
  api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
  api("GET", "/ledger/account?isBankAccount=true&fields=*"),
]);

console.log("costLine:", costLine.id);

const vat25 = vatTypes.find((v: any) => v.percentage === 25);
console.log("vatType 25%:", vat25?.id);

let bankAccount = bankAccounts.find((a: any) => a.bankAccountNumber);
if (!bankAccount && bankAccounts.length > 0) {
  bankAccount = bankAccounts[0];
  console.log("Bank account needs number, updating:", bankAccount.id);
  bankAccount = await api("PUT", `/ledger/account/${bankAccount.id}`, {
    ...bankAccount,
    bankAccountNumber: "12345678901",
  });
}
console.log("bankAccount:", bankAccount?.id, "number:", bankAccount?.bankAccountNumber);

// Step 9: POST invoice
const dueDate = "2026-04-20";
const invoice = await api("POST", "/invoice?sendToCustomer=false", {
  invoiceDate: TODAY,
  invoiceDueDate: dueDate,
  customer: { id: customerId },
  orders: [{
    customer: { id: customerId },
    project: { id: projectId },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [{
      description: "Cloud-Migration Eichenhof - Projektleistungen",
      count: 1,
      unitPriceExcludingVatCurrency: 253000,
      vatType: { id: vat25.id },
    }],
  }],
});

console.log("INVOICE:", JSON.stringify(invoice, null, 2).slice(0, 2000));
console.log("\n=== DONE ===");
console.log("Customer:", customerId);
console.log("Employee Hannah:", emp1Id);
console.log("Employee Marie:", emp2Id);
console.log("Project:", projectId);
console.log("Budget:", 253000);
console.log("Hours Hannah:", totalHannah);
console.log("Hours Marie:", totalMarie);
console.log("Cost:", 47050);
console.log("Invoice ID:", invoice.id);
console.log("Invoice Number:", invoice.invoiceNumber);
