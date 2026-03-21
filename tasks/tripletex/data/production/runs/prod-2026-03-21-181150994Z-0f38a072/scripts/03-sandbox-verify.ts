const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { headers });
  const body = await r.json();
  console.log("GET", path, r.status);
  if (!r.ok) { console.error(JSON.stringify(body)); throw new Error(`GET ${r.status}`); }
  return body;
}
async function post(path: string, data: any) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(data) });
  const body = await r.json();
  console.log("POST", path, r.status);
  if (!r.ok) { console.error(JSON.stringify(body)); }
  return { status: r.status, body };
}
async function putReq(path: string, data: any) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method: "PUT", headers, body: JSON.stringify(data) });
  const body = await r.json();
  console.log("PUT", path, r.status);
  if (!r.ok) { console.error(JSON.stringify(body)); }
  return { status: r.status, body };
}

function splitHours(totalHours: number, startDate: string): { date: string; hours: number }[] {
  const entries: { date: string; hours: number }[] = [];
  let remaining = totalHours;
  const [y, m, d] = startDate.split("-").map(Number);
  let offset = 0;
  while (remaining > 0) {
    const chunk = Math.min(remaining, 7.5);
    const dt = new Date(Date.UTC(y, m - 1, d + offset));
    entries.push({ date: dt.toISOString().slice(0, 10), hours: chunk });
    remaining = +(remaining - chunk).toFixed(2);
    offset++;
  }
  return entries;
}

const RND = Math.floor(Math.random() * 100000);

async function main() {
  const TODAY = "2026-03-21";

  // === TEST 1: Verify isChargeable on root of projectActivity fails ===
  // First create minimum prerequisites: customer, project
  console.log("\n=== Step 1: GET dept + div + POST customer ===");
  const [deptRes, divRes, custRes] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=*"),
    get("/division?count=1&fields=*"),
    post("/customer", {
      name: `SandboxLifecycle ${RND} AS`,
      organizationNumber: "932075482",
      isCustomer: true,
    }),
  ]);

  const deptId = deptRes.values?.[0]?.id;
  const divId = divRes.values?.[0]?.id;
  const customerId = custRes.body.value.id;
  console.log("Customer:", customerId, "Dept:", deptId, "Div:", divId);

  let finalDeptId = deptId;
  if (!finalDeptId) {
    const d = await post("/department", { name: "Avdeling" });
    finalDeptId = d.body.value.id;
  }

  const employmentBase: any = { startDate: TODAY };
  if (divId) employmentBase.division = { id: divId };

  console.log("\n=== Step 2: POST employee 1 ===");
  const emp1Res = await post("/employee", {
    firstName: "Test",
    lastName: `Worker${RND}A`,
    email: `test.a.${RND}@example.org`,
    dateOfBirth: "1985-06-15",
    userType: "NO_ACCESS",
    department: { id: finalDeptId },
    employments: [{ ...employmentBase }],
  });
  const emp1Id = emp1Res.body.value.id;

  console.log("\n=== Step 3: GET manager + POST employee 2 ===");
  const [mgrRes, emp2Res] = await Promise.all([
    get("/employee?assignableProjectManagers=true&count=1&fields=*"),
    post("/employee", {
      firstName: "Test",
      lastName: `Worker${RND}B`,
      email: `test.b.${RND}@example.org`,
      dateOfBirth: "1990-03-22",
      userType: "NO_ACCESS",
      department: { id: finalDeptId },
      employments: [{ ...employmentBase }],
    }),
  ]);
  const mgrId = mgrRes.values[0].id;
  const emp2Id = emp2Res.body.value.id;

  console.log("\n=== Step 4: POST project ===");
  const projRes = await post("/project", {
    name: `Lifecycle Test ${RND}`,
    startDate: TODAY,
    customer: { id: customerId },
    projectManager: { id: mgrId },
  });
  const projectId = projRes.body.value.id;

  // === TEST: isChargeable on ROOT of projectActivity (should fail 422) ===
  console.log("\n=== TEST A: isChargeable on projectActivity root (expect 422) ===");
  const testA = await post("/project/projectActivity", {
    project: { id: projectId },
    startDate: TODAY,
    budgetFeeCurrency: 100000,
    activity: {
      name: "TestActivityA",
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
    },
    isChargeable: false,
  });
  console.log("TEST A result:", testA.status);

  // === TEST: isChargeable INSIDE activity object (should succeed 201) ===
  console.log("\n=== TEST B: isChargeable inside activity object (expect 201) ===");
  const testB = await post("/project/projectActivity", {
    project: { id: projectId },
    startDate: TODAY,
    budgetFeeCurrency: 100000,
    activity: {
      name: "TestActivityB",
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: false,
    },
  });
  console.log("TEST B result:", testB.status);
  if (testB.status === 201) {
    const activityId = testB.body.value.activity.id;
    console.log("Activity ID:", activityId, "Budget:", testB.body.value.budgetFeeCurrency);

    // === Continue full path: timesheet + supplier ===
    console.log("\n=== Step 6: Timesheet + Supplier ===");
    const sam_entries = splitHours(74, TODAY);
    const sarah_entries = splitHours(85, TODAY);
    const timesheetPayload = [
      ...sam_entries.map(e => ({
        employee: { id: emp1Id },
        project: { id: projectId },
        activity: { id: activityId },
        date: e.date,
        hours: e.hours,
      })),
      ...sarah_entries.map(e => ({
        employee: { id: emp2Id },
        project: { id: projectId },
        activity: { id: activityId },
        date: e.date,
        hours: e.hours,
      })),
    ];

    const [tsRes, suppRes] = await Promise.all([
      post("/timesheet/entry/list", timesheetPayload),
      post("/supplier", {
        name: `SandboxSupplier ${RND} AS`,
        organizationNumber: "889264985",
        isSupplier: true,
      }),
    ]);
    console.log("Timesheet entries:", tsRes.body.values?.length);

    // === Step 7: cost + vat + bank ===
    console.log("\n=== Step 7: Cost + VAT + Bank ===");
    const [costRes, vatRes, bankRes] = await Promise.all([
      post("/project/orderline", {
        project: { id: projectId },
        description: "Supplier cost",
        date: TODAY,
        count: 1,
        unitCostCurrency: 56750,
        isChargeable: false,
      }),
      get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
      get("/ledger/account?isBankAccount=true&fields=*"),
    ]);

    const vatTypeId = vatRes.values[0].id;
    let bankAccount = bankRes.values[0];
    console.log("Bank account:", bankAccount.id, "number:", bankAccount.bankAccountNumber);

    // Fix bank if needed
    if (!bankAccount.bankAccountNumber) {
      const fixRes = await putReq(`/ledger/account/${bankAccount.id}`, {
        ...bankAccount,
        bankAccountNumber: "12345678903",
      });
      bankAccount = fixRes.body.value;
      console.log("Fixed bank:", bankAccount.bankAccountNumber);
    }

    // === Step 9: Invoice ===
    console.log("\n=== Step 9: Invoice ===");
    const invoiceRes = await post("/invoice?sendToCustomer=false", {
      invoiceDate: TODAY,
      invoiceDueDate: "2026-04-20",
      customer: { id: customerId },
      orders: [
        {
          customer: { id: customerId },
          project: { id: projectId },
          orderDate: TODAY,
          deliveryDate: TODAY,
          orderLines: [
            {
              description: "Project Services",
              count: 1,
              unitPriceExcludingVatCurrency: 396900,
              vatType: { id: vatTypeId },
            },
          ],
        },
      ],
    });
    console.log("Invoice:", invoiceRes.body.value?.id);
    console.log("Invoice number:", invoiceRes.body.value?.invoiceNumber);
    console.log("Amount excl VAT:", invoiceRes.body.value?.amountExcludingVatCurrency);
    console.log("Project details:", invoiceRes.body.value?.projectInvoiceDetails?.length);
  }

  // === TEST C: isChargeable omitted entirely (expect 201) ===
  console.log("\n=== TEST C: isChargeable omitted entirely (expect 201) ===");
  const testC = await post("/project/projectActivity", {
    project: { id: projectId },
    startDate: TODAY,
    budgetFeeCurrency: 50000,
    activity: {
      name: "TestActivityC",
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
    },
  });
  console.log("TEST C result:", testC.status);
  if (testC.status === 201) {
    console.log("isChargeable on returned activity:", testC.body.value.activity?.isChargeable);
  }

  console.log("\n=== SANDBOX VERIFICATION COMPLETE ===");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
