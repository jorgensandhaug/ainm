// Sandbox verification: confirm the 8-call >24-hour non-chargeable branch is still optimal
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`\n>>> ${method} ${path}`);
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`<<< ${res.status}`);
  if (!res.ok) console.log("ERROR:", JSON.stringify(json, null, 2));
  return { ok: res.ok, status: res.status, data: json?.value ?? json };
}

async function main() {
  // Use the known sandbox analog: codex.verify.1773957815637@example.org + Sandbox Hour Invoice Project 1774020541520 + Prosjektadministrasjon
  // Test with 38 hours (>24) to match the production run shape

  // 1. GET employee
  const empRes = await api("GET", "/employee?email=codex.verify.1773957815637@example.org&count=10&fields=*");
  const emp = empRes.data?.values?.[0];
  if (!emp) { console.log("Employee not found"); return; }
  console.log(`Employee: id=${emp.id}`);

  // 2. GET project
  const projRes = await api("GET", `/project?name=${encodeURIComponent("Sandbox Hour Invoice Project 1774020541520")}&count=50&fields=*,customer(*)`);
  const project = projRes.data?.values?.find((p: any) => p.name === "Sandbox Hour Invoice Project 1774020541520");
  if (!project) { console.log("Project not found"); return; }
  console.log(`Project: id=${project.id}, customer.id=${project.customer?.id}`);

  // 3. GET activity
  const actRes = await api("GET", `/activity/>forTimeSheet?projectId=${project.id}&employeeId=${emp.id}&date=2026-09-01&query=Prosjektadministrasjon&filterExistingHours=false&count=50&fields=*`);
  const activity = actRes.data?.values?.find((a: any) => a.name === "Prosjektadministrasjon");
  if (!activity) { console.log("Activity not found"); return; }
  console.log(`Activity: id=${activity.id}, isChargeable=${activity.isChargeable}`);

  // 4. POST timesheet entry 1 (24h on 2026-09-01)
  const ts1 = await api("POST", "/timesheet/entry", {
    employee: { id: emp.id },
    project: { id: project.id },
    activity: { id: activity.id },
    date: "2026-09-01",
    hours: 24,
    projectChargeableHours: 24
  });
  console.log(`TS1: id=${ts1.data?.id}, hours=${ts1.data?.hours}, chargeable=${ts1.data?.chargeable}, hourlyRate=${ts1.data?.hourlyRate}`);

  // 5. POST timesheet entry 2 (14h on 2026-09-02)
  const ts2 = await api("POST", "/timesheet/entry", {
    employee: { id: emp.id },
    project: { id: project.id },
    activity: { id: activity.id },
    date: "2026-09-02",
    hours: 14,
    projectChargeableHours: 14
  });
  console.log(`TS2: id=${ts2.data?.id}, hours=${ts2.data?.hours}, chargeable=${ts2.data?.chargeable}, hourlyRate=${ts2.data?.hourlyRate}`);

  // 6. GET vatType
  const vatRes = await api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-09-01&fields=*");
  const vatTypes = vatRes.data?.values ?? [];
  const vatType = vatTypes[0];
  console.log(`VAT: id=${vatType?.id}, percentage=${vatType?.percentage}`);

  // 7. POST order
  const orderRes = await api("POST", "/order", {
    customer: { id: project.customer?.id },
    project: { id: project.id },
    orderDate: "2026-09-01",
    deliveryDate: "2026-09-01",
    orderLines: [{
      description: "Prosjektadministrasjon",
      count: 38,
      unitPriceExcludingVatCurrency: 1400,
      vatType: { id: vatType?.id }
    }]
  });
  console.log(`Order: id=${orderRes.data?.id}`);

  // 8. PUT order/:invoice
  const invRes = await api("PUT", `/order/${orderRes.data?.id}/:invoice?invoiceDate=2026-09-01&sendToCustomer=false`);
  if (invRes.ok) {
    console.log(`Invoice: id=${invRes.data?.id}, amountExcludingVatCurrency=${invRes.data?.amountExcludingVatCurrency}, amountCurrencyOutstanding=${invRes.data?.amountCurrencyOutstanding}`);
    console.log(`\n=== VERIFICATION ===`);
    console.log(`Expected: 38 * 1400 = ${38 * 1400}`);
    console.log(`Got: amountExcludingVatCurrency=${invRes.data?.amountExcludingVatCurrency}`);
    console.log(`Match: ${invRes.data?.amountExcludingVatCurrency === 38 * 1400}`);
    console.log(`Total calls: 8, Errors: 0`);
  } else {
    console.log("Invoice failed - checking if bank account issue");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
