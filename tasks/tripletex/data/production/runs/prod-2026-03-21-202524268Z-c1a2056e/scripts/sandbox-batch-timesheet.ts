const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  console.log(`\n>>> ${method} ${url}`);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`<<< ${res.status}`);
  console.log(JSON.stringify(json, null, 2));
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  // 1. Find the sandbox employee
  const empRes = await api("GET", `/employee?email=codex.verify.1773957815637@example.org&count=10&fields=*`);
  const employee = empRes.values[0];
  const employeeId = employee.id;
  console.log(`\nEmployee: ${employee.firstName} ${employee.lastName} (id=${employeeId})`);

  // 2. Find the sandbox project
  const projRes = await api("GET", `/project?name=Sandbox+Hour+Invoice+Project+1774020541520&count=10&fields=*,customer(*)`);
  const project = projRes.values[0];
  const projectId = project.id;
  const customerId = project.customer.id;
  console.log(`\nProject: ${project.name} (id=${projectId}), Customer: ${project.customer.name} (id=${customerId})`);

  // 3. Find the non-chargeable activity
  const actRes = await api("GET", `/activity/%3EforTimeSheet?projectId=${projectId}&employeeId=${employeeId}&date=2026-10-15&query=Prosjektadministrasjon&filterExistingHours=false&count=50&fields=*`);
  const activity = actRes.values.find((a: any) => a.name === "Prosjektadministrasjon");
  if (!activity) throw new Error("Activity not found");
  const activityId = activity.id;
  console.log(`\nActivity: ${activity.name} (id=${activityId}, isChargeable=${activity.isChargeable})`);

  // 4. Test POST /timesheet/entry/list with 2 entries on different dates
  // Use future dates that haven't been used before
  const date1 = "2026-10-15";
  const date2 = "2026-10-16";

  console.log(`\n=== Testing POST /timesheet/entry/list with 2 entries ===`);
  const batchRes = await api("POST", `/timesheet/entry/list`, [
    {
      employee: { id: employeeId },
      project: { id: projectId },
      activity: { id: activityId },
      date: date1,
      hours: 24,
      projectChargeableHours: 24,
    },
    {
      employee: { id: employeeId },
      project: { id: projectId },
      activity: { id: activityId },
      date: date2,
      hours: 4,
      projectChargeableHours: 4,
    },
  ]);

  console.log(`\nBatch result count: ${batchRes.values?.length}`);
  for (const entry of batchRes.values || []) {
    console.log(`  Entry id=${entry.id}, date=${entry.date}, hours=${entry.hours}, projectChargeableHours=${entry.projectChargeableHours}, chargeable=${entry.chargeable}, hourlyRate=${entry.hourlyRate}`);
  }

  // 5. Now test the full 7-call path: resolve + batch timesheet + vatType + order + invoice
  // Use the same entries we just created (hours are already registered)
  // Just test the order + invoice part

  const vatRes = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${date1}&fields=*`);
  const vatType = vatRes.values[0];
  console.log(`\nVAT: id=${vatType.id}, name=${vatType.name}, percentage=${vatType.percentage}`);

  // Create order
  const orderRes = await api("POST", `/order`, {
    customer: { id: customerId },
    project: { id: projectId },
    orderDate: date1,
    deliveryDate: date1,
    orderLines: [
      {
        description: "Prosjektadministrasjon",
        count: 28,
        unitPriceExcludingVatCurrency: 1200,
        vatType: { id: vatType.id },
      },
    ],
  });
  const orderId = orderRes.value.id;
  console.log(`\nOrder created: id=${orderId}`);

  // Invoice
  const invRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=${date1}&sendToCustomer=false`);
  const inv = invRes.value;
  console.log(`\nInvoice: id=${inv.id}, number=${inv.invoiceNumber}`);
  console.log(`amountExcludingVatCurrency=${inv.amountExcludingVatCurrency}`);
  console.log(`amountCurrencyOutstanding=${inv.amountCurrencyOutstanding}`);

  console.log(`\n=== TOTAL CALLS (for full path with batch): ===`);
  console.log(`1. GET /employee`);
  console.log(`2. GET /project`);
  console.log(`3. GET /activity/>forTimeSheet`);
  console.log(`4. POST /timesheet/entry/list (batch 2 entries)`);
  console.log(`5. GET /ledger/vatType`);
  console.log(`6. POST /order`);
  console.log(`7. PUT /order/:invoice`);
  console.log(`= 7 calls total for >24h non-chargeable on configured account`);
}

main().catch((e) => {
  console.error("\nFATAL:", e.message);
  process.exit(1);
});
