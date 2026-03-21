const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "-X-gnn7J6_LJNmCWiRjnmd28ANQOn7Nc9fl-nPOHglU";
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
  if (!res.ok) {
    console.log("ERROR:", JSON.stringify(json, null, 2));
    return { ok: false, status: res.status, data: json };
  }
  return { ok: true, status: res.status, data: json?.value ?? json };
}

async function main() {
  // 1. GET employee
  const empRes = await api("GET", "/employee?email=camille.petit@example.org&count=10&fields=*");
  if (!empRes.ok) { console.log("BLOCKED: cannot fetch employee"); return; }
  const emp = empRes.data?.values?.[0];
  if (!emp) { console.log("BLOCKED: employee not found"); return; }
  const employeeId = emp.id;
  console.log(`Employee: id=${employeeId}, name=${emp.firstName} ${emp.lastName}`);

  // 2. GET project with expanded customer
  const projRes = await api("GET", `/project?name=${encodeURIComponent("Audit de sécurité")}&count=50&fields=*,customer(*)`);
  if (!projRes.ok) { console.log("BLOCKED: cannot fetch project"); return; }
  const projects = projRes.data?.values ?? [];
  const project = projects.find((p: any) => p.name === "Audit de sécurité");
  if (!project) { console.log("BLOCKED: project not found"); return; }
  const projectId = project.id;
  const customerId = project.customer?.id;
  const customerOrgNr = project.customer?.organizationNumber;
  console.log(`Project: id=${projectId}, name=${project.name}`);
  console.log(`Customer: id=${customerId}, orgNr=${customerOrgNr}, name=${project.customer?.name}`);
  if (customerOrgNr !== "824869383") {
    console.log("WARNING: customer org number mismatch, expected 824869383, got", customerOrgNr);
  }

  // 3. GET activity for timesheet
  const actRes = await api("GET", `/activity/>forTimeSheet?projectId=${projectId}&employeeId=${employeeId}&date=2026-03-21&query=Design&filterExistingHours=false&count=50&fields=*`);
  if (!actRes.ok) { console.log("BLOCKED: cannot fetch activities"); return; }
  const activities = actRes.data?.values ?? [];
  const activity = activities.find((a: any) => a.name === "Design") ?? activities[0];
  if (!activity) { console.log("BLOCKED: activity 'Design' not found"); return; }
  const activityId = activity.id;
  const isChargeable = activity.isChargeable;
  console.log(`Activity: id=${activityId}, name=${activity.name}, isChargeable=${isChargeable}`);

  // 4. If chargeable, handle hourly rates
  if (isChargeable) {
    const hrRes = await api("GET", `/project/hourlyRates?projectId=${projectId}&count=100&fields=*,projectSpecificRates(*,employee(*),activity(*))`);
    if (hrRes.ok) {
      const holders = hrRes.data?.values ?? [];
      let holder = holders[0];

      if (!holder) {
        // Create holder
        const createHolder = await api("POST", "/project/hourlyRates", {
          project: { id: projectId },
          startDate: "2026-03-21",
          hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES"
        });
        if (createHolder.ok) holder = createHolder.data;
      } else if (holder.hourlyRateModel !== "TYPE_PROJECT_SPECIFIC_HOURLY_RATES") {
        // Switch model
        const switchRes = await api("PUT", `/project/hourlyRates/${holder.id}`, {
          id: holder.id,
          project: { id: projectId },
          startDate: holder.startDate || "2026-03-21",
          hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES"
        });
        if (switchRes.ok) holder = switchRes.data;
      }

      if (holder) {
        const rates = holder.projectSpecificRates ?? [];
        const existingRate = rates.find((r: any) =>
          r.employee?.id === employeeId && r.activity?.id === activityId
        );
        if (existingRate && existingRate.hourlyRate === 1400) {
          console.log("Rate already exists, reusing");
        } else if (existingRate) {
          await api("PUT", `/project/hourlyRates/projectSpecificRates/${existingRate.id}`, {
            id: existingRate.id,
            hourlyRate: 1400,
            employee: { id: employeeId },
            activity: { id: activityId }
          });
        } else {
          await api("POST", "/project/hourlyRates/projectSpecificRates", {
            hourlyRate: 1400,
            employee: { id: employeeId },
            activity: { id: activityId },
            projectHourlyRate: { id: holder.id }
          });
        }
      }
    }
  }

  // 5. POST timesheet entries — 38 > 24, split into 24 + 14
  const ts1 = await api("POST", "/timesheet/entry", {
    employee: { id: employeeId },
    project: { id: projectId },
    activity: { id: activityId },
    date: "2026-03-21",
    hours: 24,
    projectChargeableHours: 24
  });
  if (!ts1.ok) { console.log("BLOCKED: timesheet entry 1 failed"); return; }
  console.log(`Timesheet 1: id=${ts1.data?.id}, hours=${ts1.data?.hours}, chargeable=${ts1.data?.chargeable}, hourlyRate=${ts1.data?.hourlyRate}`);

  const ts2 = await api("POST", "/timesheet/entry", {
    employee: { id: employeeId },
    project: { id: projectId },
    activity: { id: activityId },
    date: "2026-03-22",
    hours: 14,
    projectChargeableHours: 14
  });
  if (!ts2.ok) { console.log("BLOCKED: timesheet entry 2 failed"); return; }
  console.log(`Timesheet 2: id=${ts2.data?.id}, hours=${ts2.data?.hours}, chargeable=${ts2.data?.chargeable}, hourlyRate=${ts2.data?.hourlyRate}`);

  // 6. GET vatType
  const vatRes = await api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*");
  if (!vatRes.ok) { console.log("BLOCKED: cannot fetch VAT types"); return; }
  const vatTypes = vatRes.data?.values ?? [];
  const vatType = vatTypes[0];
  console.log(`VAT type: id=${vatType?.id}, name=${vatType?.name}, percentage=${vatType?.percentage}`);

  // 7. POST order
  const orderRes = await api("POST", "/order", {
    customer: { id: customerId },
    project: { id: projectId },
    orderDate: "2026-03-21",
    deliveryDate: "2026-03-21",
    orderLines: [{
      description: "Design",
      count: 38,
      unitPriceExcludingVatCurrency: 1400,
      vatType: { id: vatType?.id }
    }]
  });
  if (!orderRes.ok) { console.log("BLOCKED: order creation failed"); return; }
  const orderId = orderRes.data?.id;
  console.log(`Order: id=${orderId}`);

  // 8. PUT order/:invoice
  const invRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false`);

  if (!invRes.ok) {
    // Check for bank account error
    const errMsg = JSON.stringify(invRes.data);
    if (errMsg.includes("bankkontonummer") || errMsg.includes("bank account")) {
      console.log("Bank account missing, recovering...");
      const bankRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
      if (bankRes.ok) {
        const bankAccounts = bankRes.data?.values ?? [];
        const invoiceAcct = bankAccounts.find((a: any) => !a.bankAccountNumber || a.bankAccountNumber.trim() === "");
        if (invoiceAcct) {
          await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
            ...invoiceAcct,
            bankAccountNumber: "86011117947"
          });
        }
      }
      // Retry invoice
      const retryRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false`);
      if (!retryRes.ok) { console.log("BLOCKED: invoice retry failed"); return; }
      console.log("\n=== INVOICE (after recovery) ===");
      console.log(JSON.stringify(retryRes.data, null, 2));
    } else {
      console.log("BLOCKED: invoice creation failed");
      return;
    }
  } else {
    console.log("\n=== INVOICE ===");
    console.log(JSON.stringify(invRes.data, null, 2));
  }

  console.log("\nDONE");
}

main().catch(e => { console.error(e); process.exit(1); });
