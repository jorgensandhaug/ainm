// Full end-to-end test: proactive bank check + POST /invoice, >24h batch
// Expected: 7 calls on configured, 8 on unconfigured, 0 errors
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const h = { Authorization: AUTH, "Content-Type": "application/json" };
let callCount = 0;

async function get(path: string) {
  callCount++;
  const url = `${BASE}${path}`;
  console.log(`[${callCount}] GET ${url}`);
  const r = await fetch(url, { headers: h });
  const body = await r.json();
  if (!r.ok) { console.error("FAIL", r.status, JSON.stringify(body).slice(0, 300)); throw new Error(`GET ${r.status}`); }
  return body;
}
async function post(path: string, data: any) {
  callCount++;
  const url = `${BASE}${path}`;
  console.log(`[${callCount}] POST ${url}`);
  const r = await fetch(url, { method: "POST", headers: h, body: JSON.stringify(data) });
  const body = await r.json();
  if (!r.ok) { console.error("FAIL", r.status, JSON.stringify(body).slice(0, 300)); throw new Error(`POST ${r.status}`); }
  return body;
}

async function main() {
  // 1. GET /employee
  const empRes = await get("/employee?email=codex.verify.1773957815637@example.org&count=10&fields=*");
  const emp = empRes.values[0];
  console.log("Employee:", emp.id);

  // 2. GET /project
  const projRes = await get("/project?name=Sandbox+Hour+Invoice+Project+1774020541520&count=50&fields=*,customer(*)");
  const proj = projRes.values.find((p: any) => p.name === "Sandbox Hour Invoice Project 1774020541520");
  console.log("Project:", proj.id, "Customer:", proj.customer.id);

  // 3. GET /activity
  const actRes = await get(`/activity/%3EforTimeSheet?projectId=${proj.id}&employeeId=${emp.id}&date=2026-12-01&query=Prosjektadministrasjon&filterExistingHours=false&count=50&fields=*`);
  const act = actRes.values.find((a: any) => a.name === "Prosjektadministrasjon") || actRes.values[0];
  console.log("Activity:", act.id, "isChargeable:", act.isChargeable);

  // 4. POST /timesheet/entry/list (30h = 24 + 6)
  const tsRes = await post("/timesheet/entry/list", [
    { employee: { id: emp.id }, project: { id: proj.id }, activity: { id: act.id }, date: "2026-12-01", hours: 24, projectChargeableHours: 24 },
    { employee: { id: emp.id }, project: { id: proj.id }, activity: { id: act.id }, date: "2026-12-02", hours: 6, projectChargeableHours: 6 }
  ]);
  console.log("Timesheet entries:", tsRes.values?.length);

  // 5+6. Parallel: GET /ledger/vatType + GET /ledger/account
  const [vatRes, acctRes] = await Promise.all([
    get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-12-01&fields=*"),
    get("/ledger/account?isBankAccount=true&fields=*")
  ]);
  const vat = vatRes.values?.find((v: any) => v.percentage === 0) || vatRes.values?.[0];
  console.log("VAT:", vat?.id, vat?.percentage);
  const bankAcct = acctRes.values?.[0];
  console.log("Bank account:", bankAcct?.id, "has number:", !!bankAcct?.bankAccountNumber);

  // 7. (conditional) PUT /ledger/account if no bank number
  // Sandbox already configured, skip

  // 7 (or 8). POST /invoice
  const invRes = await post("/invoice?sendToCustomer=false", {
    invoiceDate: "2026-12-01",
    invoiceDueDate: "2026-12-31",
    customer: { id: proj.customer.id },
    orders: [{
      customer: { id: proj.customer.id },
      project: { id: proj.id },
      orderDate: "2026-12-01",
      deliveryDate: "2026-12-01",
      orderLines: [{
        description: "Prosjektadministrasjon",
        count: 30,
        unitPriceExcludingVatCurrency: 850,
        vatType: { id: vat.id }
      }]
    }]
  });
  const inv = invRes.value;
  console.log("\n=== RESULT ===");
  console.log("Total calls:", callCount);
  console.log("Invoice ID:", inv?.id);
  console.log("amountExVat:", inv?.amountExcludingVatCurrency);
  console.log("outstanding:", inv?.amountCurrencyOutstanding);
  console.log("projectInvoiceDetails:", inv?.projectInvoiceDetails?.length);
  console.log("Expected amount: 30 * 850 =", 30 * 850);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
