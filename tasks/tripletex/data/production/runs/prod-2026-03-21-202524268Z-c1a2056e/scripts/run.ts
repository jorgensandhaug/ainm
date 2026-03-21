const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "JEITSuKv8LRFeWzdbziTDaVzkzIk8t4V4haqodowfNI";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const today = "2026-03-21";
const tomorrow = "2026-03-22";

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
  // 1. Resolve employee
  const empRes = await api("GET", `/employee?email=bjrn.kvamme@example.org&count=10&fields=*`);
  const employee = empRes.values.find((e: any) =>
    e.email?.toLowerCase() === "bjrn.kvamme@example.org"
  );
  if (!employee) throw new Error("Employee not found");
  const employeeId = employee.id;
  console.log(`\nEmployee: ${employee.firstName} ${employee.lastName} (id=${employeeId})`);

  // 2. Resolve project + customer
  const projRes = await api("GET", `/project?name=Datamigrering&count=50&fields=*,customer(*)`);
  const project = projRes.values.find((p: any) => {
    if (p.name !== "Datamigrering") return false;
    const cust = p.customer;
    if (!cust) return false;
    return cust.organizationNumber === "986191127" || cust.name === "Fjelltopp AS";
  });
  if (!project) throw new Error("Project not found");
  const projectId = project.id;
  const customerId = project.customer.id;
  console.log(`\nProject: ${project.name} (id=${projectId}), Customer: ${project.customer.name} (id=${customerId})`);

  // 3. Resolve activity
  const actRes = await api("GET", `/activity/%3EforTimeSheet?projectId=${projectId}&employeeId=${employeeId}&date=${today}&query=Analyse&filterExistingHours=false&count=50&fields=*`);
  const activity = actRes.values.find((a: any) =>
    a.name === "Analyse" || a.displayName === "Analyse"
  );
  if (!activity) throw new Error("Activity not found");
  const activityId = activity.id;
  const isChargeable = activity.isChargeable === true;
  console.log(`\nActivity: ${activity.name} (id=${activityId}, isChargeable=${isChargeable})`);

  // If chargeable, handle hourly rates
  if (isChargeable) {
    // GET project hourly rates
    const ratesRes = await api("GET", `/project/hourlyRates?projectId=${projectId}&count=100&fields=*,projectSpecificRates(*,employee(*),activity(*))`);

    let holderId: number | null = null;
    let needModelSwitch = false;

    if (ratesRes.values && ratesRes.values.length > 0) {
      const holder = ratesRes.values[0];
      holderId = holder.id;
      if (holder.hourlyRateModel !== "TYPE_PROJECT_SPECIFIC_HOURLY_RATES") {
        needModelSwitch = true;
      }
      // Check if exact employee+activity rate already exists
      const existingRate = holder.projectSpecificRates?.find((r: any) =>
        r.employee?.id === employeeId && r.activity?.id === activityId
      );
      if (existingRate) {
        if (existingRate.hourlyRate === 1200) {
          console.log(`\nExact rate already exists (id=${existingRate.id}), reusing`);
        } else {
          // Update existing rate
          await api("PUT", `/project/hourlyRates/projectSpecificRates/${existingRate.id}`, {
            projectHourlyRate: { id: holderId },
            employee: { id: employeeId },
            activity: { id: activityId },
            hourlyRate: 1200,
          });
        }
      } else {
        if (needModelSwitch) {
          await api("PUT", `/project/hourlyRates/${holderId}`, {
            project: { id: projectId },
            startDate: today,
            hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
          });
        }
        await api("POST", `/project/hourlyRates/projectSpecificRates`, {
          projectHourlyRate: { id: holderId },
          employee: { id: employeeId },
          activity: { id: activityId },
          hourlyRate: 1200,
        });
      }
    } else {
      // No holder, create one
      const holderRes = await api("POST", `/project/hourlyRates`, {
        project: { id: projectId },
        startDate: today,
        hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
      });
      holderId = holderRes.value.id;
      await api("POST", `/project/hourlyRates/projectSpecificRates`, {
        projectHourlyRate: { id: holderId },
        employee: { id: employeeId },
        activity: { id: activityId },
        hourlyRate: 1200,
      });
    }
  }

  // 4. Register hours - 28 > 24, split: 24 on today, 4 on tomorrow
  const ts1 = await api("POST", `/timesheet/entry`, {
    employee: { id: employeeId },
    project: { id: projectId },
    activity: { id: activityId },
    date: today,
    hours: 24,
    projectChargeableHours: 24,
  });
  console.log(`\nTimesheet 1: hours=${ts1.value.hours}, chargeable=${ts1.value.chargeable}, hourlyRate=${ts1.value.hourlyRate}`);

  const ts2 = await api("POST", `/timesheet/entry`, {
    employee: { id: employeeId },
    project: { id: projectId },
    activity: { id: activityId },
    date: tomorrow,
    hours: 4,
    projectChargeableHours: 4,
  });
  console.log(`\nTimesheet 2: hours=${ts2.value.hours}, chargeable=${ts2.value.chargeable}, hourlyRate=${ts2.value.hourlyRate}`);

  // 5. Resolve VAT type
  const vatRes = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${today}&fields=*`);
  const vatTypes = vatRes.values;
  // Pick the first outgoing VAT type (usually the standard rate)
  const vatType = vatTypes[0];
  console.log(`\nVAT type: id=${vatType.id}, name=${vatType.name}, percentage=${vatType.percentage}`);

  // 6. Create order with real order line
  const orderRes = await api("POST", `/order`, {
    customer: { id: customerId },
    project: { id: projectId },
    orderDate: today,
    deliveryDate: today,
    orderLines: [
      {
        description: "Analyse",
        count: 28,
        unitPriceExcludingVatCurrency: 1200,
        vatType: { id: vatType.id },
      },
    ],
  });
  const orderId = orderRes.value.id;
  console.log(`\nOrder created: id=${orderId}`);

  // 7. Invoice the order
  try {
    const invRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=${today}&sendToCustomer=false`);
    const inv = invRes.value;
    console.log(`\nInvoice created: id=${inv.id}, number=${inv.invoiceNumber}`);
    console.log(`amountExcludingVatCurrency=${inv.amountExcludingVatCurrency}`);
    console.log(`amountCurrencyOutstanding=${inv.amountCurrencyOutstanding}`);
    console.log(`customer.id=${inv.customer?.id}`);
  } catch (e: any) {
    // Bank account recovery
    if (e.message.includes("bankkontonummer") || e.message.includes("bank account")) {
      console.log("\n--- Bank account recovery ---");
      const acctRes = await api("GET", `/ledger/account?isBankAccount=true&fields=*`);
      const invoiceAcct = acctRes.values.find((a: any) => a.isInvoiceAccount || a.number === 1920);
      if (invoiceAcct && !invoiceAcct.bankAccountNumber) {
        await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
          ...invoiceAcct,
          bankAccountNumber: "12345678903",
        });
      }
      // Retry invoice
      const invRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=${today}&sendToCustomer=false`);
      const inv = invRes.value;
      console.log(`\nInvoice created (retry): id=${inv.id}, number=${inv.invoiceNumber}`);
      console.log(`amountExcludingVatCurrency=${inv.amountExcludingVatCurrency}`);
      console.log(`amountCurrencyOutstanding=${inv.amountCurrencyOutstanding}`);
      console.log(`customer.id=${inv.customer?.id}`);
    } else {
      throw e;
    }
  }
}

main().catch((e) => {
  console.error("\nFATAL:", e.message);
  process.exit(1);
});
