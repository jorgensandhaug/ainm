const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";
const DUE = "2026-04-04";
const TAG = Date.now();

const HOURS = 16;
const RATE = 1300;
const TOTAL = HOURS * RATE; // 20800

const H = { "Content-Type": "application/json", Authorization: AUTH };

let callCount = 0;
let errorCount = 0;

async function api(method: string, path: string, body?: any) {
  callCount++;
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!r.ok) {
    errorCount++;
    console.error(`[${callCount}] ${method} ${path} → ${r.status}`, JSON.stringify(json).slice(0, 500));
    throw new Error(`${r.status} on ${method} ${path}`);
  }
  console.log(`[${callCount}] ${method} ${path} → ${r.status}`);
  return json;
}

async function main() {
  // Test 1: Full create-from-scratch flow with isFixedPrice + single 16h entry
  // Step 1: 5 parallel (no deps)
  const [deptRes, custRes, pmRes, vatRes, accRes] = await Promise.all([
    api("GET", "/department?isInactive=false&count=1&fields=*"),
    api("POST", "/customer", { name: `Sandbox Verify ${TAG} AS`, organizationNumber: "953748460" }),
    api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
    api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
    api("GET", "/ledger/account?number=1920&fields=id,number,name,isBankAccount,bankAccountNumber"),
  ]);

  const deptId = deptRes.values?.[0]?.id;
  const custId = custRes.value.id;
  const pmId = pmRes.values[0].id;
  const vatId = vatRes.values[0].id;
  const acc1920 = accRes.values?.find((a: any) => a.number === 1920);
  const bankNeedsRepair = !acc1920?.bankAccountNumber;

  console.log(`dept=${deptId} cust=${custId} pm=${pmId} vat=${vatId} acc1920=${acc1920?.id} bankRepair=${bankNeedsRepair}`);

  // Step 2: employee + project (parallel) — WITH isFixedPrice + fixedprice
  const [empRes, projRes] = await Promise.all([
    api("POST", "/employee", {
      firstName: "SandboxCamille",
      lastName: `Dubois${TAG}`,
      email: `sandbox.camille.${TAG}@example.org`,
      dateOfBirth: "1985-01-15",
      userType: "NO_ACCESS",
      department: { id: deptId },
    }),
    api("POST", "/project", {
      name: `Sandbox Mise à niveau ${TAG}`,
      startDate: TODAY,
      customer: { id: custId },
      projectManager: { id: pmId },
      isFixedPrice: true,
      fixedprice: TOTAL,
    }),
  ]);

  const empId = empRes.value.id;
  const projId = projRes.value.id;
  const projFixedPrice = projRes.value.fixedprice;
  const projIsFixedPrice = projRes.value.isFixedPrice;
  console.log(`emp=${empId} proj=${projId} isFixedPrice=${projIsFixedPrice} fixedprice=${projFixedPrice}`);

  // Step 3: activity + participant + (vatType + account already done in step 1)
  const [actRes, _partRes] = await Promise.all([
    api("POST", "/project/projectActivity", {
      project: { id: projId },
      startDate: TODAY,
      budgetHours: HOURS,
      budgetFeeCurrency: TOTAL,
      activity: {
        name: "Design",
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: false,
      },
    }),
    api("POST", "/project/participant", {
      project: { id: projId },
      employee: { id: empId },
      adminAccess: false,
    }),
  ]);

  const activityId = actRes.value.activity.id;
  const budgetHours = actRes.value.budgetHours;
  const budgetFee = actRes.value.budgetFeeCurrency;
  console.log(`activity=${activityId} budgetHours=${budgetHours} budgetFee=${budgetFee}`);

  // Step 4: SINGLE 16h entry (test that <=24 works as one entry)
  const tsRes = await api("POST", "/timesheet/entry/list", [
    {
      employee: { id: empId },
      project: { id: projId },
      activity: { id: activityId },
      date: TODAY,
      hours: HOURS,
    },
  ]);
  console.log("Timesheet entries:", tsRes.values?.length, "hours:", tsRes.values?.[0]?.hours);

  // Step 5: bank fix if needed
  if (bankNeedsRepair) {
    console.log("Repairing bank account 1920...");
    await api("PUT", `/ledger/account/${acc1920!.id}`, {
      id: acc1920!.id,
      number: acc1920!.number,
      name: acc1920!.name,
      bankAccountNumber: "12345678903",
    });
  }

  // Step 6: invoice
  const invoiceRes = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: DUE,
    customer: { id: custId },
    orders: [
      {
        customer: { id: custId },
        project: { id: projId },
        orderDate: TODAY,
        deliveryDate: TODAY,
        orderLines: [
          {
            description: "Design – 16 heures à 1300 NOK/h",
            count: HOURS,
            unitPriceExcludingVatCurrency: RATE,
            vatType: { id: vatId },
          },
        ],
      },
    ],
  });

  console.log("=== RESULTS ===");
  console.log("Invoice ID:", invoiceRes.value?.id);
  console.log("Invoice Number:", invoiceRes.value?.invoiceNumber);
  console.log("Amount excl VAT:", invoiceRes.value?.amountExcludingVatCurrency);
  console.log("Project invoice details:", invoiceRes.value?.projectInvoiceDetails?.length);
  console.log(`Total calls: ${callCount}, Errors: ${errorCount}`);
  console.log(`Project: isFixedPrice=${projIsFixedPrice}, fixedprice=${projFixedPrice}`);
  console.log(`Activity: budgetHours=${budgetHours}, budgetFeeCurrency=${budgetFee}`);

  // Test 2: Also try WITHOUT participant to confirm 10-call path still works
  console.log("\n=== TEST 2: No participant flow ===");
  const custRes2 = await api("POST", "/customer", { name: `Sandbox NoParticipant ${TAG} AS`, organizationNumber: "953748461" });
  const custId2 = custRes2.value.id;
  const [empRes2, projRes2] = await Promise.all([
    api("POST", "/employee", {
      firstName: "NoPart",
      lastName: `Test${TAG}`,
      email: `sandbox.nopart.${TAG}@example.org`,
      dateOfBirth: "1985-01-15",
      userType: "NO_ACCESS",
      department: { id: deptId },
    }),
    api("POST", "/project", {
      name: `Sandbox NoPart Project ${TAG}`,
      startDate: TODAY,
      customer: { id: custId2 },
      projectManager: { id: pmId },
      isFixedPrice: true,
      fixedprice: TOTAL,
    }),
  ]);
  const empId2 = empRes2.value.id;
  const projId2 = projRes2.value.id;

  const actRes2 = await api("POST", "/project/projectActivity", {
    project: { id: projId2 },
    startDate: TODAY,
    budgetHours: HOURS,
    budgetFeeCurrency: TOTAL,
    activity: {
      name: "Design",
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: false,
    },
  });
  const activityId2 = actRes2.value.activity.id;

  // NO participant — directly register timesheet
  const tsRes2 = await api("POST", "/timesheet/entry/list", [
    {
      employee: { id: empId2 },
      project: { id: projId2 },
      activity: { id: activityId2 },
      date: TODAY,
      hours: HOURS,
    },
  ]);
  console.log("No-participant timesheet OK:", tsRes2.values?.length, "entries, hours:", tsRes2.values?.[0]?.hours);

  const invoiceRes2 = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: DUE,
    customer: { id: custId2 },
    orders: [
      {
        customer: { id: custId2 },
        project: { id: projId2 },
        orderDate: TODAY,
        deliveryDate: TODAY,
        orderLines: [
          {
            description: "Design – 16h × 1300 NOK/h",
            count: HOURS,
            unitPriceExcludingVatCurrency: RATE,
            vatType: { id: vatId },
          },
        ],
      },
    ],
  });
  console.log("No-participant invoice amount:", invoiceRes2.value?.amountExcludingVatCurrency);
  console.log("No-participant projectInvoiceDetails:", invoiceRes2.value?.projectInvoiceDetails?.length);
  console.log(`\nTotal calls (both tests): ${callCount}, Errors: ${errorCount}`);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
