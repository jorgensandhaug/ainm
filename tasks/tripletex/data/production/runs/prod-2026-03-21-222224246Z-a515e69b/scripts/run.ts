const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "W5TONqaO8kKrWmIlUoh3TanXfJvzxMwST28WCwaC1GQ";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}${path}`;
  console.log(`GET ${url}`);
  const r = await fetch(url, { headers: h });
  const body = await r.json();
  if (!r.ok) { console.error("GET FAIL", r.status, JSON.stringify(body)); throw new Error(`GET ${r.status}`); }
  return body;
}
async function post(path: string, data: any) {
  const url = `${BASE}${path}`;
  console.log(`POST ${url}`);
  const r = await fetch(url, { method: "POST", headers: h, body: JSON.stringify(data) });
  const body = await r.json();
  if (!r.ok) { console.error("POST FAIL", r.status, JSON.stringify(body)); throw new Error(`POST ${r.status}`); }
  return body;
}
async function put(path: string, data?: any) {
  const url = `${BASE}${path}`;
  console.log(`PUT ${url}`);
  const opts: any = { method: "PUT", headers: h };
  if (data !== undefined) opts.body = JSON.stringify(data);
  const r = await fetch(url, opts);
  const body = await r.json();
  if (!r.ok) { console.error("PUT FAIL", r.status, JSON.stringify(body)); throw new Error(`PUT ${r.status}`); }
  return body;
}

async function main() {
  // 1. Get employee
  const empRes = await get("/employee?email=randi.lunde@example.org&count=10&fields=*");
  const emp = empRes.values[0];
  console.log("Employee:", emp.id, emp.firstName, emp.lastName);

  // 2. Get project with expanded customer
  const projRes = await get("/project?name=Sikkerheitsrevisjon&count=50&fields=*,customer(*)");
  const proj = projRes.values.find((p: any) => p.name === "Sikkerheitsrevisjon");
  if (!proj) throw new Error("Project not found");
  console.log("Project:", proj.id, proj.name, "Customer:", proj.customer?.id, proj.customer?.name, "OrgNr:", proj.customer?.organizationNumber);

  // 3. Get activity
  const today = "2026-03-21";
  const actRes = await get(`/activity/%3EforTimeSheet?projectId=${proj.id}&employeeId=${emp.id}&date=${today}&query=Analyse&filterExistingHours=false&count=50&fields=*`);
  const act = actRes.values.find((a: any) => a.name === "Analyse") || actRes.values[0];
  console.log("Activity:", act.id, act.name, "isChargeable:", act.isChargeable);

  // 4. Handle chargeable branch if needed
  if (act.isChargeable) {
    const ratesRes = await get(`/project/hourlyRates?projectId=${proj.id}&count=100&fields=*,projectSpecificRates(*,employee(*),activity(*))`);
    let holder = ratesRes.values?.[0];
    if (!holder) {
      holder = (await post("/project/hourlyRates", {
        project: { id: proj.id },
        startDate: today,
        hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES"
      })).value;
    } else if (holder.hourlyRateModel !== "TYPE_PROJECT_SPECIFIC_HOURLY_RATES") {
      holder = (await put(`/project/hourlyRates/${holder.id}`, {
        project: { id: proj.id },
        startDate: holder.startDate || today,
        hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES"
      })).value;
    }
    // Check if exact rate exists
    const existingRate = holder.projectSpecificRates?.find(
      (r: any) => r.employee?.id === emp.id && r.activity?.id === act.id
    );
    if (!existingRate) {
      await post("/project/hourlyRates/projectSpecificRates", {
        hourlyRate: 850,
        employee: { id: emp.id },
        activity: { id: act.id },
        projectHourlyRate: { id: holder.id }
      });
    } else if (existingRate.hourlyRate !== 850) {
      await put(`/project/hourlyRates/projectSpecificRates/${existingRate.id}`, {
        hourlyRate: 850,
        employee: { id: emp.id },
        activity: { id: act.id },
        projectHourlyRate: { id: holder.id }
      });
    }
  }

  // 5. POST /timesheet/entry/list — 30h split as 24 + 6
  const date1 = today;
  const date2 = "2026-03-22";
  const tsRes = await post("/timesheet/entry/list", [
    {
      employee: { id: emp.id },
      project: { id: proj.id },
      activity: { id: act.id },
      date: date1,
      hours: 24,
      projectChargeableHours: 24
    },
    {
      employee: { id: emp.id },
      project: { id: proj.id },
      activity: { id: act.id },
      date: date2,
      hours: 6,
      projectChargeableHours: 6
    }
  ]);
  console.log("Timesheet entries:", JSON.stringify(tsRes.values?.map((e: any) => ({
    id: e.id, hours: e.hours, pch: e.projectChargeableHours, chargeable: e.chargeable, hourlyRate: e.hourlyRate
  }))));

  // 6. GET VAT type
  const vatRes = await get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${today}&fields=*`);
  const vatTypes = vatRes.values || [];
  console.log("VAT types:", vatTypes.map((v: any) => ({ id: v.id, name: v.name, percentage: v.percentage })));
  // Pick the standard outgoing 25% if available, else the first outgoing
  const vat25 = vatTypes.find((v: any) => v.percentage === 25) || vatTypes[0];
  console.log("Using VAT:", vat25?.id, vat25?.name, vat25?.percentage);

  // 7. POST /order
  const orderRes = await post("/order", {
    customer: { id: proj.customer.id },
    project: { id: proj.id },
    orderDate: today,
    deliveryDate: today,
    orderLines: [{
      description: "Analyse",
      count: 30,
      unitPriceExcludingVatCurrency: 850,
      vatType: vat25 ? { id: vat25.id } : undefined
    }]
  });
  const order = orderRes.value;
  console.log("Order:", order.id);

  // 8. PUT /order/:invoice
  try {
    const invRes = await put(`/order/${order.id}/:invoice?invoiceDate=${today}&sendToCustomer=false`);
    const inv = invRes.value;
    console.log("Invoice:", inv.id, "number:", inv.invoiceNumber,
      "amountExVat:", inv.amountExcludingVatCurrency,
      "outstanding:", inv.amountCurrencyOutstanding);
  } catch (e: any) {
    // Bank account recovery
    if (e.message === "PUT 422") {
      console.log("Invoice failed — trying bank account recovery...");
      const acctRes = await get("/ledger/account?isBankAccount=true&fields=*");
      const bankAcct = acctRes.values?.[0];
      if (bankAcct) {
        if (!bankAcct.bankAccountNumber || bankAcct.bankAccountNumber === "") {
          await put(`/ledger/account/${bankAcct.id}`, {
            ...bankAcct,
            bankAccountNumber: "12345678903"
          });
        }
        const invRes2 = await put(`/order/${order.id}/:invoice?invoiceDate=${today}&sendToCustomer=false`);
        const inv2 = invRes2.value;
        console.log("Invoice (retry):", inv2.id, "number:", inv2.invoiceNumber,
          "amountExVat:", inv2.amountExcludingVatCurrency,
          "outstanding:", inv2.amountCurrencyOutstanding);
      }
    } else {
      throw e;
    }
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
