const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "iq3Pp1Tts6lwgI6-mF8c7dLeBZyZpzFfhGrPoFyzKsc";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function get(p: string) {
  const r = await fetch(`${BASE}${p}`, { headers: H });
  const b = await r.json();
  if (!r.ok) { console.error(`GET ${p} → ${r.status}:`, JSON.stringify(b)); throw new Error(`GET ${p} ${r.status}`); }
  return b;
}
async function post(p: string, body: any) {
  const r = await fetch(`${BASE}${p}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) { console.error(`POST ${p} → ${r.status}:`, JSON.stringify(b)); throw new Error(`POST ${p} ${r.status}`); }
  return b;
}
async function put(p: string, body: any) {
  const r = await fetch(`${BASE}${p}`, { method: "PUT", headers: H, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) { console.error(`PUT ${p} → ${r.status}:`, JSON.stringify(b)); throw new Error(`PUT ${p} ${r.status}`); }
  return b;
}

// Safe date add without timezone issues
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function splitHours(total: number, start: string): { date: string; hours: number }[] {
  const out: { date: string; hours: number }[] = [];
  let rem = total;
  let day = 0;
  while (rem > 0) {
    const h = Math.min(rem, 7.5);
    out.push({ date: addDays(start, day), hours: h });
    rem -= h;
    day++;
  }
  return out;
}

async function main() {
  const today = "2026-03-21";

  // IDs from run1
  const custId = 108387060;
  const e1 = 18643598;  // Sigurd Berg
  const e2 = 18643602;  // Marte Johansen
  const projId = 402023656;
  const actId = 5917928;

  // Step 6: timesheet batch + supplier (parallel)
  const s1 = splitHours(75, today);
  const s2 = splitHours(47, today);
  console.log("Sigurd dates:", s1.map(c => c.date + "=" + c.hours).join(", "));
  console.log("Marte dates:", s2.map(c => c.date + "=" + c.hours).join(", "));

  const entries = [
    ...s1.map(c => ({ employee: { id: e1 }, project: { id: projId }, activity: { id: actId }, date: c.date, hours: c.hours })),
    ...s2.map(c => ({ employee: { id: e2 }, project: { id: projId }, activity: { id: actId }, date: c.date, hours: c.hours })),
  ];

  const [tsR, supR] = await Promise.all([
    post("/timesheet/entry/list", entries),
    post("/supplier", { name: "Lysgård AS", organizationNumber: "964716188", isSupplier: true }),
  ]);
  console.log("timesheet:", tsR.values?.length, "entries");
  console.log("supplier:", supR.value.id);

  // Step 7: orderline + vatType + bank account (parallel)
  const [olR, vatR, bankR] = await Promise.all([
    post("/project/orderline", {
      project: { id: projId }, description: "Leverandørkostnad Lysgård AS",
      date: today, count: 1, unitCostCurrency: 56200, isChargeable: false,
    }),
    get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${today}&fields=*`),
    get("/ledger/account?isBankAccount=true&fields=*"),
  ]);
  console.log("orderline:", olR.value.id);
  const vatId = vatR.values[0].id;
  const bank = bankR.values[0];
  console.log("vat:", vatId, "bank:", bank.id, "num:", bank.bankAccountNumber);

  // Step 8: fix bank account if needed
  if (!bank.bankAccountNumber) {
    await put(`/ledger/account/${bank.id}`, {
      id: bank.id, number: bank.number, name: bank.name, bankAccountNumber: "12345678903",
    });
    console.log("fixed bank account");
  }

  // Step 9: invoice
  const invR = await post("/invoice?sendToCustomer=false", {
    invoiceDate: today, invoiceDueDate: "2026-04-20",
    customer: { id: custId },
    orders: [{
      customer: { id: custId }, project: { id: projId },
      orderDate: today, deliveryDate: today,
      orderLines: [{
        description: "ERP-implementering Havbris", count: 1,
        unitPriceExcludingVatCurrency: 418100, vatType: { id: vatId },
      }],
    }],
  });
  console.log("invoice:", invR.value.id, "num:", invR.value.invoiceNumber);
  console.log("amount:", invR.value.amountExcludingVatCurrency);
  console.log("projDetails:", invR.value.projectInvoiceDetails?.length);
  console.log("DONE");
}

main().catch(e => { console.error(e); process.exit(1); });
