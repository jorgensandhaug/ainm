/**
 * Task 29 Round 7: Full lifecycle WITHOUT isFixedPrice, WITH hourly rates
 *
 * Changes from current approach:
 * 1. NO isFixedPrice on project (budget via activity.budgetFeeCurrency only)
 * 2. Chargeable activity
 * 3. Set hourly rates (budget/totalHours) for both employees BEFORE timesheet
 * 4. Keep voucher for supplier cost
 * 5. Invoice based on hours × rate (not budget flat amount)
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
const RUN_ID = Date.now().toString(36);
const h = { "Content-Type": "application/json", Authorization: AUTH };
const TODAY = new Date().toISOString().slice(0, 10);

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  return { ok: r.ok, status: r.status, data: await r.json() };
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  return { ok: r.ok, status: r.status, data: await r.json() };
}
async function put(path: string, body?: any) {
  const opts: any = { method: "PUT", headers: h };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  return { ok: r.ok, status: r.status, data: await r.json() };
}

// ── PROMPT VALUES (simulating a real task 29 prompt) ──
const PROJECT_NAME = "ERP-implementering TestCo";
const CUST_NAME = "TestCo AS";
const CUST_ORG = "999999984";
const BUDGET = 418100;
const PM_FIRST = "Sigurd";
const PM_LAST = "Johansen";
const PM_EMAIL = `sigurd.johansen.${RUN_ID}@example.org`;
const PM_HOURS = 47;
const CON_FIRST = "Erik";
const CON_LAST = "Haugen";
const CON_EMAIL = `erik.haugen.${RUN_ID}@example.org`;
const CON_HOURS = 46;
const SUPP_NAME = "Nordhav AS";
const SUPP_ORG = "999999983";
const SUPP_COST = 95050;

const TOTAL_HOURS = PM_HOURS + CON_HOURS; // 93
const HOURLY_RATE = Math.round(BUDGET / TOTAL_HOURS); // 4496

function splitHours(total: number, start: string): { date: string; hours: number }[] {
  const [y, m, d] = start.split("-").map(Number);
  const out: { date: string; hours: number }[] = [];
  let rem = total, off = 0;
  while (rem > 0) {
    const hrs = Math.min(rem, 7.5);
    out.push({ date: new Date(Date.UTC(y, m - 1, d + off)).toISOString().slice(0, 10), hours: hrs });
    rem -= hrs; off++;
  }
  return out;
}

async function main() {
  console.log(`\nTask 29 Full Lifecycle — NEW APPROACH — Run ID: ${RUN_ID}`);
  console.log(`Budget: ${BUDGET}, Hours: ${TOTAL_HOURS} (${PM_HOURS}+${CON_HOURS}), Rate: ${HOURLY_RATE}/hr`);
  console.log(`Invoice amount: ${BUDGET} (same as budget)\n`);

  // ═══════════════════════════════════════════════════════════
  // STEP 1: Frontload reads + create customer
  // ═══════════════════════════════════════════════════════════
  const [dept, pmRes, acctRes, vatRes, vtRes, cust] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=*"),
    get("/employee?assignableProjectManagers=true&count=1&fields=*"),
    get("/ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber"),
    get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=id,name,percentage`),
    get("/ledger/voucherType?name=Leverand%C3%B8rfaktura&count=1&fields=id,name"),
    post("/customer", { name: CUST_NAME, organizationNumber: CUST_ORG, isCustomer: true }),
  ]);
  const deptId = dept.data.values[0].id;
  const pmId = pmRes.data.values[0].id;
  const a1920 = acctRes.data.values.find((a: any) => a.number === 1920);
  const acc6590 = acctRes.data.values.find((a: any) => a.number === 6590);
  const acc2400 = acctRes.data.values.find((a: any) => a.number === 2400);
  const vatId = vatRes.data.values[0].id;
  const vtId = vtRes.data.values[0].id;
  const custId = cust.data.value.id;
  console.log("STEP 1: Reads + customer ✓");

  // ═══════════════════════════════════════════════════════════
  // STEP 2: Employees + project + bank fix
  //   KEY CHANGE: NO isFixedPrice on project!
  // ═══════════════════════════════════════════════════════════
  const s2: Promise<any>[] = [
    post("/employee/list", [
      { firstName: PM_FIRST, lastName: PM_LAST, email: PM_EMAIL, dateOfBirth: "1988-01-01", userType: "NO_ACCESS", department: { id: deptId } },
      { firstName: CON_FIRST, lastName: CON_LAST, email: CON_EMAIL, dateOfBirth: "1992-01-01", userType: "NO_ACCESS", department: { id: deptId } },
    ]),
    post("/project", {
      name: PROJECT_NAME,
      startDate: TODAY,
      customer: { id: custId },
      projectManager: { id: pmId },
      // NO isFixedPrice, NO fixedprice — budget goes on activity only
    }),
  ];
  if (a1920 && !a1920.bankAccountNumber) {
    s2.push(put(`/ledger/account/${a1920.id}`, { ...a1920, bankAccountNumber: "12345678903" }));
  }
  const [emps, proj] = await Promise.all(s2);
  const e1 = emps.data.values[0].id;
  const e2 = emps.data.values[1].id;
  const pId = proj.data.value.id;
  console.log(`STEP 2: Employees [${e1}, ${e2}] + project ${pId} ✓`);
  console.log(`  Project isFixedPrice=${proj.data.value.isFixedPrice} fixedprice=${proj.data.value.fixedprice}`);

  // ═══════════════════════════════════════════════════════════
  // STEP 3: Activity (CHARGEABLE) + participants
  // ═══════════════════════════════════════════════════════════
  const [act, parts] = await Promise.all([
    post("/project/projectActivity", {
      project: { id: pId },
      startDate: TODAY,
      budgetHours: TOTAL_HOURS,
      budgetFeeCurrency: BUDGET,
      activity: {
        name: "Prosjektarbeid",
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: true,  // KEY CHANGE: chargeable!
      },
    }),
    post("/project/participant/list", [
      { project: { id: pId }, employee: { id: e1 }, adminAccess: true },
      { project: { id: pId }, employee: { id: e2 }, adminAccess: false },
    ]),
  ]);
  const actId = act.data.value.activity.id;
  console.log(`STEP 3: Activity ${actId} (chargeable=${act.data.value.activity.isChargeable}) + participants ✓`);

  // ═══════════════════════════════════════════════════════════
  // STEP 4: Set up hourly rates (MUST be before timesheet!)
  // ═══════════════════════════════════════════════════════════
  const rh = await get(`/project/hourlyRates?projectId=${pId}&count=10&fields=*`);
  const holder = rh.data.values[0];
  await put(`/project/hourlyRates/${holder.id}`, {
    project: { id: pId },
    startDate: TODAY,
    hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
  });
  const [r1, r2] = await Promise.all([
    post("/project/hourlyRates/projectSpecificRates", {
      projectHourlyRate: { id: holder.id },
      employee: { id: e1 },
      activity: { id: actId },
      hourlyRate: HOURLY_RATE,
    }),
    post("/project/hourlyRates/projectSpecificRates", {
      projectHourlyRate: { id: holder.id },
      employee: { id: e2 },
      activity: { id: actId },
      hourlyRate: HOURLY_RATE,
    }),
  ]);
  console.log(`STEP 4: Hourly rates set: PM=${r1.data.value?.hourlyRate}, Con=${r2.data.value?.hourlyRate} ✓`);

  // ═══════════════════════════════════════════════════════════
  // STEP 5: Timesheet + supplier + orderline
  // ═══════════════════════════════════════════════════════════
  const ts1 = splitHours(PM_HOURS, TODAY).map(e => ({
    employee: { id: e1 }, project: { id: pId }, activity: { id: actId }, date: e.date, hours: e.hours,
  }));
  const ts2 = splitHours(CON_HOURS, TODAY).map(e => ({
    employee: { id: e2 }, project: { id: pId }, activity: { id: actId }, date: e.date, hours: e.hours,
  }));
  const [tsRes, suppRes, olRes] = await Promise.all([
    post("/timesheet/entry/list", [...ts1, ...ts2]),
    post("/supplier", { name: SUPP_NAME, organizationNumber: SUPP_ORG, isSupplier: true }),
    post("/project/orderline", {
      project: { id: pId },
      description: "Leverandørkostnad",
      date: TODAY,
      count: 1,
      unitCostCurrency: SUPP_COST,
      isChargeable: false,
    }),
  ]);
  const suppId = suppRes.data.value.id;
  const tsEntries = tsRes.data.values || [];
  console.log(`STEP 5: Timesheet (${tsEntries.length} entries) + supplier ${suppId} + orderline ✓`);
  console.log(`  First entry: hours=${tsEntries[0]?.hours} hourlyRate=${tsEntries[0]?.hourlyRate} chargeable=${tsEntries[0]?.chargeable}`);
  console.log(`  Last entry:  hours=${tsEntries[tsEntries.length-1]?.hours} hourlyRate=${tsEntries[tsEntries.length-1]?.hourlyRate}`);

  // ═══════════════════════════════════════════════════════════
  // STEP 6: Voucher + order (parallel)
  // ═══════════════════════════════════════════════════════════
  const [voucher, ord] = await Promise.all([
    post("/ledger/voucher", {
      date: TODAY,
      description: `${SUPP_NAME} - leverandørkostnad`,
      voucherType: { id: vtId },
      postings: [
        { row: 1, account: { id: acc6590!.id }, amount: SUPP_COST, amountCurrency: SUPP_COST, amountGross: SUPP_COST, amountGrossCurrency: SUPP_COST, project: { id: pId }, date: TODAY },
        { row: 2, account: { id: acc2400!.id }, amount: -SUPP_COST, amountCurrency: -SUPP_COST, amountGross: -SUPP_COST, amountGrossCurrency: -SUPP_COST, supplier: { id: suppId }, date: TODAY },
      ],
    }),
    post("/order", {
      customer: { id: custId },
      project: { id: pId },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: PROJECT_NAME,
        count: 1,
        unitPriceExcludingVatCurrency: BUDGET,
        vatType: { id: vatId },
      }],
    }),
  ]);
  const ordId = ord.data.value.id;
  console.log(`STEP 6: Voucher ${voucher.data.value?.id} + order ${ordId} ✓`);

  // ═══════════════════════════════════════════════════════════
  // STEP 7: Invoice
  // ═══════════════════════════════════════════════════════════
  const inv = await put(`/order/${ordId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
  const invId = inv.data.value.id;
  console.log(`STEP 7: Invoice ${invId} ✓`);

  // ═══════════════════════════════════════════════════════════
  // FULL READBACK — compare to old approach
  // ═══════════════════════════════════════════════════════════
  console.log("\n" + "=".repeat(70));
  console.log("FULL READBACK — NEW APPROACH (no isFixedPrice, with hourly rates)");
  console.log("=".repeat(70));

  const [projFull, invFull, tsFull, ratesFull, olFull, vchFull] = await Promise.all([
    get(`/project/${pId}?fields=*`),
    get(`/invoice/${invId}?fields=*,projectInvoiceDetails(*),orders(*,orderLines(*))`),
    get(`/timesheet/entry?projectId=${pId}&dateFrom=${TODAY}&dateTo=2027-01-01&fields=employee(id,firstName,lastName),hours,chargeable,hourlyRate&count=500`),
    get(`/project/hourlyRates?projectId=${pId}&count=10&fields=*,projectSpecificRates(*,employee(id,firstName,lastName),activity(id,name))`),
    get(`/project/orderline?projectId=${pId}&count=10&fields=*`),
    get(`/ledger/voucher/${voucher.data.value.id}?fields=*,postings(*)`),
  ]);

  const pf = projFull.data.value;
  console.log("\nPROJECT:");
  console.log(`  name: ${pf.name}`);
  console.log(`  customer: ${pf.customer?.id}`);
  console.log(`  projectManager: ${JSON.stringify(pf.projectManager)}`);
  console.log(`  isFixedPrice: ${pf.isFixedPrice}`);
  console.log(`  fixedprice: ${pf.fixedprice}`);
  console.log(`  isInternal: ${pf.isInternal}`);
  console.log(`  isClosed: ${pf.isClosed}`);
  console.log(`  isReadyForInvoicing: ${pf.isReadyForInvoicing}`);
  console.log(`  invoiceReserveTotalAmountCurrency: ${pf.invoiceReserveTotalAmountCurrency}`);
  console.log(`  numberOfProjectParticipants: ${pf.numberOfProjectParticipants}`);

  const iv = invFull.data.value;
  console.log("\nINVOICE:");
  console.log(`  id: ${iv.id}`);
  console.log(`  invoiceNumber: ${iv.invoiceNumber}`);
  console.log(`  amountExcludingVatCurrency: ${iv.amountExcludingVatCurrency}`);
  console.log(`  amountIncludingVatCurrency: ${iv.amountIncludingVatCurrency}`);
  console.log(`  isApproved: ${iv.isApproved}`);
  console.log(`  isSent: ${iv.isSent}`);
  console.log(`  projectInvoiceDetails:`);
  for (const d of iv.projectInvoiceDetails || []) {
    console.log(`    project: ${d.project?.id}`);
    console.log(`    feeAmount: ${d.feeAmount}`);
    console.log(`    includeHours: ${d.includeHours}`);
    console.log(`    includeOrderLinesAndReinvoicing: ${d.includeOrderLinesAndReinvoicing}`);
    console.log(`    amountOrderLinesAndReinvoicing: ${d.amountOrderLinesAndReinvoicing}`);
  }

  // Timesheet summary
  const byEmployee: Record<string, { hours: number; chargeable: boolean; rate: number }> = {};
  for (const ts of tsFull.data.values || []) {
    const key = `${ts.employee?.firstName} ${ts.employee?.lastName}`;
    if (!byEmployee[key]) byEmployee[key] = { hours: 0, chargeable: true, rate: ts.hourlyRate };
    byEmployee[key].hours += ts.hours;
    if (!ts.chargeable) byEmployee[key].chargeable = false;
  }
  console.log("\nTIMESHEET:");
  for (const [name, data] of Object.entries(byEmployee)) {
    console.log(`  ${name}: ${data.hours}h, chargeable=${data.chargeable}, hourlyRate=${data.rate}`);
  }

  console.log("\nRATES:");
  const rh2 = ratesFull.data.values?.[0];
  console.log(`  model: ${rh2?.hourlyRateModel}`);
  for (const r of rh2?.projectSpecificRates || []) {
    console.log(`  ${r.employee?.firstName} ${r.employee?.lastName} on ${r.activity?.name}: ${r.hourlyRate}/hr`);
  }

  console.log("\nORDERLINES:");
  for (const ol of olFull.data.values || []) {
    console.log(`  ${ol.description}: cost=${ol.unitCostCurrency} vendor=${ol.vendor?.id ?? 'null'}`);
  }

  console.log("\nVOUCHER:");
  console.log(`  id: ${vchFull.data.value?.id} type: ${vchFull.data.value?.voucherType?.id}`);
  for (const p of vchFull.data.value?.postings || []) {
    console.log(`  row ${p.row}: acct=${p.account?.id} amt=${p.amount} project=${p.project?.id ?? '-'} supplier=${p.supplier?.id ?? '-'}`);
  }

  console.log("\n" + "=".repeat(70));
  console.log("SUMMARY: Key differences from old approach:");
  console.log("  - isFixedPrice: false (was true)");
  console.log(`  - hourlyRate on timesheet: ${Object.values(byEmployee)[0]?.rate} (was 0)`);
  console.log(`  - chargeable: ${Object.values(byEmployee)[0]?.chargeable} (was false)`);
  console.log(`  - invoiceReserveTotalAmountCurrency: ${pf.invoiceReserveTotalAmountCurrency} (was ${BUDGET})`);
  console.log("=".repeat(70));
}

main().catch(e => { console.error("FATAL:", e.message, e.stack); process.exit(1); });
