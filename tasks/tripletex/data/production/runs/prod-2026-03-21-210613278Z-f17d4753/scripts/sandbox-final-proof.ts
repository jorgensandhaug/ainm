// FINAL PROOF: Complete lifecycle flow matching the updated trusted standard
// Expected: 17 calls base (or 18 with bank fix), 0 errors
// All 4 previously-failing-check fields correctly populated

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

let callCount = 0;
let errorCount = 0;

async function api(method: string, path: string, body?: any) {
  callCount++;
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Content-Type": "application/json", Authorization: AUTH },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`[${callCount}] ${method} ${path} → ${r.status}`);
  if (r.status >= 400) {
    errorCount++;
    console.log("ERROR:", JSON.stringify(json).slice(0, 500));
    throw new Error(`${method} ${path} → ${r.status}`);
  }
  return json;
}

function splitHours(total: number, startDate: string): { date: string; hours: number }[] {
  const chunks: { date: string; hours: number }[] = [];
  const [y, m, d] = startDate.split("-").map(Number);
  let remaining = total;
  let offset = 0;
  while (remaining > 0) {
    const h = Math.min(remaining, 7.5);
    const dt = new Date(Date.UTC(y, m - 1, d + offset));
    chunks.push({ date: dt.toISOString().slice(0, 10), hours: h });
    remaining -= h;
    offset++;
  }
  return chunks;
}

async function main() {
  const uid = Math.random().toString(36).slice(2, 8);
  console.log("=== FINAL PROOF uid:", uid, "===\n");

  // STEP 1: GET dept + POST customer + GET assignable PM (parallel, 3 calls)
  console.log("--- Step 1: dept + customer + PM ---");
  const [deptRes, custRes, pmRes] = await Promise.all([
    api("GET", "/department?isInactive=false&count=1&fields=*"),
    api("POST", "/customer", {
      name: `Horizonte ${uid} Lda`,
      organizationNumber: "857400526",
      isCustomer: true,
    }),
    api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
  ]);
  const deptId = deptRes.values?.[0]?.id;
  const customerId = custRes.value.id;
  const pmId = pmRes.values[0].id;

  // STEP 2: POST emp1 + POST emp2 + POST project (parallel, 3 calls)
  console.log("\n--- Step 2: emp1 + emp2 + project ---");
  const [emp1Res, emp2Res, projRes] = await Promise.all([
    api("POST", "/employee", {
      firstName: "Catarina", lastName: "Martins",
      email: `catarina.${uid}@example.org`, dateOfBirth: "1990-01-15",
      userType: "NO_ACCESS", department: { id: deptId },
    }),
    api("POST", "/employee", {
      firstName: "João", lastName: "Martins",
      email: `joao.${uid}@example.org`, dateOfBirth: "1992-06-20",
      userType: "NO_ACCESS", department: { id: deptId },
    }),
    api("POST", "/project", {
      name: `Migração Cloud Horizonte ${uid}`,
      startDate: TODAY,
      customer: { id: customerId },
      projectManager: { id: pmId },
      isFixedPrice: true,        // CRITICAL: was missing in production
      fixedprice: 229500,         // CRITICAL: was missing in production
    }),
  ]);
  const emp1Id = emp1Res.value.id;
  const emp2Id = emp2Res.value.id;
  const projectId = projRes.value.id;

  // STEP 3: POST projectActivity + POST participant(PM) + POST participant(other) (parallel, 3 calls)
  console.log("\n--- Step 3: activity + participants ---");
  const [paRes, , ] = await Promise.all([
    api("POST", "/project/projectActivity", {
      project: { id: projectId }, startDate: TODAY,
      budgetFeeCurrency: 229500,
      budgetHours: 99,             // CRITICAL: was missing in production
      activity: {
        name: "Prosjektaktivitet",
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: false,
      },
    }),
    api("POST", "/project/participant", {
      project: { id: projectId }, employee: { id: emp1Id },
      adminAccess: true,           // CRITICAL: was false in production
    }),
    api("POST", "/project/participant", {
      project: { id: projectId }, employee: { id: emp2Id },
      adminAccess: false,
    }),
  ]);
  const activityId = paRes.value.activity.id;

  // STEP 4: POST timesheet + POST supplier + GET accounts + GET voucherType (parallel, 4 calls)
  console.log("\n--- Step 4: timesheet + supplier + accounts + voucherType ---");
  const emp1Chunks = splitHours(37, TODAY);
  const emp2Chunks = splitHours(62, TODAY);
  const timesheetEntries = [
    ...emp1Chunks.map(c => ({
      employee: { id: emp1Id }, project: { id: projectId },
      activity: { id: activityId }, date: c.date, hours: c.hours,
    })),
    ...emp2Chunks.map(c => ({
      employee: { id: emp2Id }, project: { id: projectId },
      activity: { id: activityId }, date: c.date, hours: c.hours,
    })),
  ];

  const [tsRes, suppRes, accRes, vtRes] = await Promise.all([
    api("POST", "/timesheet/entry/list", timesheetEntries),
    api("POST", "/supplier", {
      name: `Oceano ${uid} Lda`, organizationNumber: "941830420", isSupplier: true,
    }),
    api("GET", "/ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber"),
    api("GET", "/ledger/voucherType?name=Leverand%C3%B8rfaktura&count=1&fields=id,name"),
  ]);
  const suppId = suppRes.value.id;
  const acc6590 = accRes.values.find((a: any) => a.number === 6590);
  const acc2400 = accRes.values.find((a: any) => a.number === 2400);
  const acc1920 = accRes.values.find((a: any) => a.number === 1920);
  const voucherTypeId = vtRes.values[0].id;

  // STEP 5: POST orderline + POST voucher + GET vatType (parallel, 3 calls)
  console.log("\n--- Step 5: orderline + voucher + vatType ---");
  const [olRes, voucherRes, vatRes] = await Promise.all([
    api("POST", "/project/orderline", {     // CRITICAL: was missing in production
      project: { id: projectId },
      description: `Leverandørkostnad Oceano ${uid} Lda`,
      date: TODAY, count: 1, unitCostCurrency: 56300, isChargeable: false,
    }),
    api("POST", "/ledger/voucher", {
      date: TODAY, description: `Leverandørkostnad Oceano ${uid} Lda`,
      voucherType: { id: voucherTypeId },
      postings: [
        {
          row: 1, date: TODAY, description: "Leverandørkostnad",
          account: { id: acc6590!.id },
          amount: 56300, amountCurrency: 56300, amountGross: 56300, amountGrossCurrency: 56300,
          project: { id: projectId },
        },
        {
          row: 2, date: TODAY, description: "Leverandørgjeld",
          account: { id: acc2400!.id },
          amount: -56300, amountCurrency: -56300, amountGross: -56300, amountGrossCurrency: -56300,
          supplier: { id: suppId },
        },
      ],
    }),
    api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
  ]);
  const vatType = vatRes.values.find((v: any) => v.percentage === 25.0) || vatRes.values[0];

  // STEP 6: Fix bank account if needed (0-1 calls)
  if (acc1920 && !acc1920.bankAccountNumber) {
    console.log("\n--- Step 6: bank account fix ---");
    await api("PUT", `/ledger/account/${acc1920.id}`, {
      ...acc1920, bankAccountNumber: "12345678903",
    });
  }

  // STEP 7: POST invoice (1 call)
  console.log("\n--- Step 7: invoice ---");
  const invoiceRes = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: TODAY, invoiceDueDate: "2026-04-20",
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId }, project: { id: projectId },
      orderDate: TODAY, deliveryDate: TODAY,
      orderLines: [{
        description: `Migração Cloud Horizonte ${uid} - Prosjekttjenester`,
        count: 1, unitPriceExcludingVatCurrency: 229500, vatType: { id: vatType.id },
      }],
    }],
  });

  // =====================================
  // RESULTS
  // =====================================
  console.log("\n\n========================================");
  console.log("=== RESULTS ===");
  console.log("========================================\n");
  console.log(`Total API calls: ${callCount}`);
  console.log(`Total errors: ${errorCount}`);
  console.log("");

  // Check all 4 previously-failing fields
  console.log("=== CHECK 3 (budget) ===");
  console.log(`  project.isFixedPrice: ${projRes.value.isFixedPrice}`);
  console.log(`  project.fixedprice: ${projRes.value.fixedprice}`);
  console.log(`  projectActivity.budgetFeeCurrency: ${paRes.value.budgetFeeCurrency}`);
  console.log(`  projectActivity.budgetHours: ${paRes.value.budgetHours}`);

  console.log("\n=== CHECK 4 (hours emp1) ===");
  const emp1Hours = tsRes.values.filter((e: any) => e.employee.id === emp1Id).reduce((s: number, e: any) => s + e.hours, 0);
  console.log(`  Catarina (emp1 ${emp1Id}): ${emp1Hours}h`);

  console.log("\n=== CHECK 5 (hours emp2 / supplier cost) ===");
  const emp2Hours = tsRes.values.filter((e: any) => e.employee.id === emp2Id).reduce((s: number, e: any) => s + e.hours, 0);
  console.log(`  João (emp2 ${emp2Id}): ${emp2Hours}h`);
  console.log(`  orderline.unitCostCurrency: ${olRes.value.unitCostCurrency}`);
  console.log(`  voucher.id: ${voucherRes.value.id}`);

  console.log("\n=== CHECK 6 (supplier linkage / participants) ===");
  console.log(`  supplier.id: ${suppId}`);

  console.log("\n=== CHECK 7 (invoice) ===");
  console.log(`  invoice.id: ${invoiceRes.value.id}`);
  console.log(`  invoice.amountExcludingVatCurrency: ${invoiceRes.value.amountExcludingVatCurrency}`);
  console.log(`  invoice.projectInvoiceDetails.length: ${invoiceRes.value.projectInvoiceDetails?.length}`);

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
