const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";
const DUE = "2026-04-04";
const TAG = Date.now();

const HOURS = 16;
const RATE = 1300;
const TOTAL = HOURS * RATE;

const H = { "Content-Type": "application/json", Authorization: AUTH };
let callCount = 0;

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
    console.error(`[${callCount}] ${method} ${path} → ${r.status}`, JSON.stringify(json).slice(0, 500));
    throw new Error(`${r.status} on ${method} ${path}`);
  }
  console.log(`[${callCount}] ${method} ${path} → ${r.status}`);
  return json;
}

async function main() {
  // Test: Can POST timesheet and POST invoice run in parallel?
  // Invoice doesn't reference timesheet entries - it uses manual count/price

  // Step 1: 5 parallel
  const [deptRes, custRes, pmRes, vatRes, accRes] = await Promise.all([
    api("GET", "/department?isInactive=false&count=1&fields=*"),
    api("POST", "/customer", { name: `Parallel Test ${TAG} AS`, organizationNumber: "953748462" }),
    api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
    api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
    api("GET", "/ledger/account?number=1920&fields=id,number,name,isBankAccount,bankAccountNumber"),
  ]);

  const deptId = deptRes.values[0].id;
  const custId = custRes.value.id;
  const pmId = pmRes.values[0].id;
  const vatId = vatRes.values[0].id;

  // Step 2: employee + project (parallel)
  const [empRes, projRes] = await Promise.all([
    api("POST", "/employee", {
      firstName: "ParTest",
      lastName: `E${TAG}`,
      email: `par.test.${TAG}@example.org`,
      dateOfBirth: "1985-01-15",
      userType: "NO_ACCESS",
      department: { id: deptId },
    }),
    api("POST", "/project", {
      name: `Parallel Project ${TAG}`,
      startDate: TODAY,
      customer: { id: custId },
      projectManager: { id: pmId },
      isFixedPrice: true,
      fixedprice: TOTAL,
    }),
  ]);

  const empId = empRes.value.id;
  const projId = projRes.value.id;

  // Step 3: project activity only (no participant for minimal path)
  const actRes = await api("POST", "/project/projectActivity", {
    project: { id: projId },
    startDate: TODAY,
    budgetHours: HOURS,
    budgetFeeCurrency: TOTAL,
    activity: {
      name: "Design",
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: false,
    },
  });
  const activityId = actRes.value.activity.id;

  // Step 4: POST timesheet AND POST invoice IN PARALLEL
  const [tsRes, invoiceRes] = await Promise.all([
    api("POST", "/timesheet/entry/list", [
      {
        employee: { id: empId },
        project: { id: projId },
        activity: { id: activityId },
        date: TODAY,
        hours: HOURS,
      },
    ]),
    api("POST", "/invoice?sendToCustomer=false", {
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
              description: "Design – 16h × 1300",
              count: HOURS,
              unitPriceExcludingVatCurrency: RATE,
              vatType: { id: vatId },
            },
          ],
        },
      ],
    }),
  ]);

  console.log("\n=== RESULTS ===");
  console.log("Timesheet entries:", tsRes.values?.length, "hours:", tsRes.values?.[0]?.hours);
  console.log("Invoice amount excl VAT:", invoiceRes.value?.amountExcludingVatCurrency);
  console.log("Project invoice details:", invoiceRes.value?.projectInvoiceDetails?.length);
  console.log(`Total calls: ${callCount}, sequential steps: 4`);
  console.log("Path: 5 + 2 + 1 + 2(parallel) = 10 calls, 4 sequential steps");
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
