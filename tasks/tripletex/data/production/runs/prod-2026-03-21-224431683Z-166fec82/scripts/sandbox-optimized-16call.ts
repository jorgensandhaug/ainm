// Full lifecycle sandbox re-proof with optimized 16-call path (POST /employee/list)
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";
const h = { Authorization: AUTH, "Content-Type": "application/json" };
let callCount = 0;

async function get(path: string) {
  callCount++;
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const j = await r.json();
  if (!r.ok) { console.error(`GET ${path} ${r.status}`, JSON.stringify(j)); throw new Error(`GET ${path} ${r.status}`); }
  console.log(`[${callCount}] GET ${path} → ${r.status}`);
  return j;
}
async function post(path: string, body: any) {
  callCount++;
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) { console.error(`POST ${path} ${r.status}`, JSON.stringify(j)); throw new Error(`POST ${path} ${r.status}`); }
  console.log(`[${callCount}] POST ${path} → ${r.status}`);
  return j;
}
async function put(path: string, body: any) {
  callCount++;
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) { console.error(`PUT ${path} ${r.status}`, JSON.stringify(j)); throw new Error(`PUT ${path} ${r.status}`); }
  console.log(`[${callCount}] PUT ${path} → ${r.status}`);
  return j;
}

function splitHours(total: number, startDate: string): { date: string; hours: number }[] {
  const entries: { date: string; hours: number }[] = [];
  let remaining = total;
  const [y, m, d] = startDate.split("-").map(Number);
  let offset = 0;
  while (remaining > 0) {
    const chunk = Math.min(remaining, 7.5);
    const dt = new Date(Date.UTC(y, m - 1, d + offset));
    entries.push({ date: dt.toISOString().slice(0, 10), hours: chunk });
    remaining -= chunk;
    offset++;
  }
  return entries;
}

async function main() {
  const ts = Date.now();

  // === STEP 1 (3 calls parallel): dept + customer + PM ===
  const [deptRes, custRes, pmRes] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=*"),
    post("/customer", { name: `Sandbox Lifecycle ${ts}`, organizationNumber: "929610156", isCustomer: true }),
    get("/employee?assignableProjectManagers=true&count=1&fields=*"),
  ]);
  const deptId = deptRes.values?.[0]?.id;
  const customerId = custRes.value.id;
  const pmId = pmRes.values[0].id;
  console.log("  dept=", deptId, "customer=", customerId, "pm=", pmId);

  // === STEP 2 (2 calls parallel): batch employees + project ===
  const [empsRes, projRes] = await Promise.all([
    post("/employee/list", [
      { firstName: "Emma", lastName: `Weber${ts}`, email: `emma.weber${ts}@example.org`, dateOfBirth: "1990-01-01", userType: "NO_ACCESS", ...(deptId ? { department: { id: deptId } } : {}) },
      { firstName: "Anna", lastName: `Becker${ts}`, email: `anna.becker${ts}@example.org`, dateOfBirth: "1992-06-15", userType: "NO_ACCESS", ...(deptId ? { department: { id: deptId } } : {}) },
    ]),
    post("/project", {
      name: `Sandbox Lifecycle Project ${ts}`,
      startDate: TODAY,
      customer: { id: customerId },
      projectManager: { id: pmId },
      isFixedPrice: true,
      fixedprice: 405900,
    }),
  ]);
  const emp1Id = empsRes.values[0].id; // Emma - PM
  const emp2Id = empsRes.values[1].id; // Anna
  const projectId = projRes.value.id;
  console.log("  emp1=", emp1Id, "emp2=", emp2Id, "project=", projectId);
  console.log("  isFixedPrice=", projRes.value.isFixedPrice, "fixedprice=", projRes.value.fixedprice);

  // === STEP 3 (3 calls parallel): activity + 2 participants ===
  const totalHours = 73 + 134; // 207
  const [paRes, part1Res, part2Res] = await Promise.all([
    post("/project/projectActivity", {
      project: { id: projectId },
      startDate: TODAY,
      budgetFeeCurrency: 405900,
      budgetHours: totalHours,
      activity: { name: "Prosjektaktivitet", activityType: "PROJECT_SPECIFIC_ACTIVITY", isChargeable: false },
    }),
    post("/project/participant", { project: { id: projectId }, employee: { id: emp1Id }, adminAccess: true }),
    post("/project/participant", { project: { id: projectId }, employee: { id: emp2Id }, adminAccess: false }),
  ]);
  const activityId = paRes.value.activity.id;
  console.log("  activity=", activityId, "budgetHours=", paRes.value.budgetHours);

  // === STEP 4 (6 calls parallel): timesheet + supplier + accounts + voucherType + orderline + vatType ===
  const emmaEntries = splitHours(73, TODAY);
  const annaEntries = splitHours(134, TODAY);
  const timesheetPayload = [
    ...emmaEntries.map(e => ({ employee: { id: emp1Id }, project: { id: projectId }, activity: { id: activityId }, date: e.date, hours: e.hours })),
    ...annaEntries.map(e => ({ employee: { id: emp2Id }, project: { id: projectId }, activity: { id: activityId }, date: e.date, hours: e.hours })),
  ];

  const [tsRes, suppRes, accRes, vtRes, olRes, vatRes] = await Promise.all([
    post("/timesheet/entry/list", timesheetPayload),
    post("/supplier", { name: `Silberberg GmbH ${ts}`, organizationNumber: "818922248", isSupplier: true }),
    get("/ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber"),
    get("/ledger/voucherType?name=Leverand%C3%B8rfaktura&count=1&fields=id,name"),
    post("/project/orderline", { project: { id: projectId }, description: "Lieferantenkosten", date: TODAY, count: 1, unitCostCurrency: 55650, isChargeable: false }),
    get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=" + TODAY + "&fields=*"),
  ]);

  const supplierId = suppRes.value.id;
  const accounts = accRes.values as any[];
  const acc1920 = accounts.find((a: any) => a.number === 1920)!;
  const acc6590 = accounts.find((a: any) => a.number === 6590)!;
  const acc2400 = accounts.find((a: any) => a.number === 2400)!;
  const voucherTypeId = vtRes.values[0].id;
  console.log("  supplier=", supplierId, "acc1920=", acc1920.id, "acc6590=", acc6590.id, "acc2400=", acc2400.id, "vt=", voucherTypeId);
  console.log("  acc1920.bankAccountNumber=", acc1920.bankAccountNumber);
  console.log("  orderline=", olRes.value.id);
  console.log("  timesheet entries=", tsRes.values?.length);

  // === STEP 5 (1-2 calls parallel): voucher + bank fix ===
  const bankNeedsFix = !acc1920.bankAccountNumber;
  const step5Calls: Promise<any>[] = [
    post("/ledger/voucher", {
      date: TODAY,
      description: "Lieferantenkosten Silberberg GmbH",
      voucherType: { id: voucherTypeId },
      postings: [
        { row: 1, account: { id: acc6590.id }, amount: 55650, amountCurrency: 55650, amountGross: 55650, amountGrossCurrency: 55650, project: { id: projectId } },
        { row: 2, account: { id: acc2400.id }, amount: -55650, amountCurrency: -55650, amountGross: -55650, amountGrossCurrency: -55650, supplier: { id: supplierId } },
      ],
    }),
  ];
  if (bankNeedsFix) {
    step5Calls.push(put(`/ledger/account/${acc1920.id}`, { id: acc1920.id, number: acc1920.number, name: acc1920.name, bankAccountNumber: "12345678903" }));
  }
  const step5Results = await Promise.all(step5Calls);
  console.log("  voucher=", step5Results[0].value.id);
  if (bankNeedsFix) console.log("  bank fix applied");

  // === STEP 6 (1 call): invoice ===
  const vat25 = (vatRes.values as any[]).find((v: any) => v.percentage === 25);
  const invoiceRes = await post("/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: "2026-04-22",
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      project: { id: projectId },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: "Sandbox Lifecycle Project",
        count: 1,
        unitPriceExcludingVatCurrency: 405900,
        ...(vat25 ? { vatType: { id: vat25.id } } : {}),
      }],
    }],
  });

  console.log("\n=== RESULTS ===");
  console.log("Total API calls:", callCount);
  console.log("Errors: 0");
  console.log("Invoice:", invoiceRes.value.id, "number=", invoiceRes.value.invoiceNumber);
  console.log("Invoice amount:", invoiceRes.value.amountExcludingVatCurrency);
  console.log("projectInvoiceDetails:", invoiceRes.value.projectInvoiceDetails?.length);
  console.log("Bank fix needed:", bankNeedsFix);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
