// Sandbox test: Can POST /invoice replace POST /order + PUT /order/:invoice for existing entities?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}${path}`;
  console.log(`GET ${url}`);
  const r = await fetch(url, { headers: h });
  const body = await r.json();
  if (!r.ok) { console.error("GET FAIL", r.status, JSON.stringify(body).slice(0, 500)); throw new Error(`GET ${r.status}`); }
  return body;
}
async function post(path: string, data: any) {
  const url = `${BASE}${path}`;
  console.log(`POST ${url}`);
  const r = await fetch(url, { method: "POST", headers: h, body: JSON.stringify(data) });
  const body = await r.json();
  console.log("POST response status:", r.status);
  console.log("POST response body:", JSON.stringify(body).slice(0, 1500));
  if (!r.ok) { console.error("POST FAIL", r.status); throw new Error(`POST ${r.status}`); }
  return body;
}

async function main() {
  // 1. Get employee
  const empRes = await get("/employee?email=codex.verify.1773957815637@example.org&count=10&fields=*");
  const emp = empRes.values[0];
  console.log("Employee:", emp.id, emp.firstName, emp.lastName);

  // 2. Get project with customer
  const projRes = await get("/project?name=Sandbox+Hour+Invoice+Project+1774020541520&count=50&fields=*,customer(*)");
  const proj = projRes.values.find((p: any) => p.name === "Sandbox Hour Invoice Project 1774020541520");
  console.log("Project:", proj.id, "Customer:", proj.customer?.id, proj.customer?.name);

  // 3. Get activity
  const actRes = await get(`/activity/%3EforTimeSheet?projectId=${proj.id}&employeeId=${emp.id}&date=2026-11-15&query=Prosjektadministrasjon&filterExistingHours=false&count=50&fields=*`);
  const act = actRes.values.find((a: any) => a.name === "Prosjektadministrasjon") || actRes.values[0];
  console.log("Activity:", act.id, act.name, "isChargeable:", act.isChargeable);

  // 4. Create timesheet entry (small: 8h)
  const tsRes = await post("/timesheet/entry/list", [
    {
      employee: { id: emp.id },
      project: { id: proj.id },
      activity: { id: act.id },
      date: "2026-11-15",
      hours: 8,
      projectChargeableHours: 8
    }
  ]);
  console.log("Timesheet:", JSON.stringify(tsRes.values?.map((e: any) => ({ id: e.id, hours: e.hours }))));

  // 5. Get VAT type
  const vatRes = await get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-11-15&fields=*");
  const vatTypes = vatRes.values || [];
  const vat = vatTypes.find((v: any) => v.percentage === 0) || vatTypes[0];
  console.log("VAT:", vat?.id, vat?.name, vat?.percentage);

  // 6. Try POST /invoice directly (create-from-scratch pattern)
  const today = "2026-11-15";
  const dueDate = "2026-12-15";
  try {
    const invRes = await post("/invoice?sendToCustomer=false", {
      invoiceDate: today,
      invoiceDueDate: dueDate,
      customer: { id: proj.customer.id },
      orders: [{
        project: { id: proj.id },
        orderDate: today,
        deliveryDate: today,
        orderLines: [{
          description: "Prosjektadministrasjon",
          count: 8,
          unitPriceExcludingVatCurrency: 850,
          vatType: { id: vat.id }
        }]
      }]
    });
    const inv = invRes.value;
    console.log("\n=== POST /invoice SUCCESS ===");
    console.log("Invoice ID:", inv?.id);
    console.log("Invoice number:", inv?.invoiceNumber);
    console.log("amountExVat:", inv?.amountExcludingVatCurrency);
    console.log("outstanding:", inv?.amountCurrencyOutstanding);
    console.log("customer.id:", inv?.customer?.id);
    console.log("orders:", JSON.stringify(inv?.orders?.map((o: any) => ({ id: o.id, project: o.project?.id }))));
  } catch (e: any) {
    console.error("\n=== POST /invoice FAILED ===");
    console.error(e.message);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
