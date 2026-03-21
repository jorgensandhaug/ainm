const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";
const RND = Math.random().toString(36).slice(2, 8);
let callCount = 0;

async function api(method: string, path: string, body?: any) {
  callCount++;
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!r.ok) {
    console.error(`[${callCount}] ${method} ${path} -> ${r.status}`, JSON.stringify(json).slice(0, 400));
    throw new Error(`${r.status} on ${method} ${path}`);
  }
  console.log(`[${callCount}] ${method} ${path} -> ${r.status}`);
  return json;
}

function splitHours(total: number, startDate: string): { date: string; hours: number }[] {
  const entries: { date: string; hours: number }[] = [];
  const [y, m, d] = startDate.split("-").map(Number);
  let remaining = total;
  let offset = 0;
  while (remaining > 0) {
    const h = Math.min(remaining, 7.5);
    const dt = new Date(Date.UTC(y, m - 1, d + offset));
    entries.push({ date: dt.toISOString().slice(0, 10), hours: h });
    remaining -= h;
    offset++;
  }
  return entries;
}

async function main() {
  // ── Step 1: dept + customer + PM (3 parallel) ──
  const [deptRes, custRes, pmRes] = await Promise.all([
    api("GET", "/department?isInactive=false&count=1&fields=*"),
    api("POST", "/customer", { name: `OptTest ${RND} GmbH`, organizationNumber: "986645888" }),
    api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
  ]);
  const deptId = deptRes.values[0].id;
  const customerId = custRes.value.id;
  const pmManagerId = pmRes.values[0].id;

  // ── Step 2: batch employees + project (2 parallel — saves 1 call) ──
  const [empBatchRes, projRes] = await Promise.all([
    api("POST", "/employee/list", [
      { firstName: "Hannah", lastName: `Weber${RND}`, email: `hannah-${RND}@example.org`, dateOfBirth: "1985-01-15", userType: "NO_ACCESS", department: { id: deptId } },
      { firstName: "Marie", lastName: `Fischer${RND}`, email: `marie-${RND}@example.org`, dateOfBirth: "1987-06-20", userType: "NO_ACCESS", department: { id: deptId } },
    ]),
    api("POST", "/project", {
      name: `Cloud-Migration OptTest ${RND}`,
      startDate: TODAY,
      customer: { id: customerId },
      projectManager: { id: pmManagerId },
      isFixedPrice: true,
      fixedprice: 253000,
    }),
  ]);
  const emps = empBatchRes.values;
  const hannahId = emps[0].id;
  const marieId = emps[1].id;
  const projectId = projRes.value.id;

  // ── Step 3: activity + batch participants (2 parallel — saves 1 call) ──
  const [actRes, partRes] = await Promise.all([
    api("POST", "/project/projectActivity", {
      project: { id: projectId },
      startDate: TODAY,
      budgetHours: 152,
      budgetFeeCurrency: 253000,
      activity: { name: "Prosjektaktivitet", activityType: "PROJECT_SPECIFIC_ACTIVITY", isChargeable: false },
    }),
    api("POST", "/project/participant/list", [
      { project: { id: projectId }, employee: { id: hannahId }, adminAccess: true },
      { project: { id: projectId }, employee: { id: marieId }, adminAccess: false },
    ]),
  ]);
  const activityId = actRes.value.activity.id;
  const parts = partRes.values;
  console.log(`Participants: ${parts.map((p: any) => `emp=${p.employee?.id} admin=${p.adminAccess}`).join(", ")}`);

  // ── Step 4: timesheet + supplier + accounts + voucherType + vatType (5 parallel) ──
  const hannahEntries = splitHours(34, TODAY).map(e => ({
    employee: { id: hannahId }, project: { id: projectId }, activity: { id: activityId }, date: e.date, hours: e.hours,
  }));
  const marieEntries = splitHours(118, TODAY).map(e => ({
    employee: { id: marieId }, project: { id: projectId }, activity: { id: activityId }, date: e.date, hours: e.hours,
  }));

  const [tsRes, suppRes, accRes, vtRes, vatRes] = await Promise.all([
    api("POST", "/timesheet/entry/list", [...hannahEntries, ...marieEntries]),
    api("POST", "/supplier", { name: `Silberberg ${RND} GmbH`, organizationNumber: "823323948" }),
    api("GET", "/ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber"),
    api("GET", `/ledger/voucherType?name=${encodeURIComponent("Leverandørfaktura")}&count=1&fields=id,name`),
    api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
  ]);

  const supplierId = suppRes.value.id;
  const accounts = accRes.values as any[];
  const acc1920 = accounts.find((a: any) => a.number === 1920);
  const acc6590 = accounts.find((a: any) => a.number === 6590);
  const acc2400 = accounts.find((a: any) => a.number === 2400);
  const voucherTypeId = vtRes.values[0].id;
  const vatTypes = vatRes.values as any[];
  const vat25 = vatTypes.find((v: any) => v.percentage === 25.0) || vatTypes[0];

  console.log(`Accounts: 1920=${acc1920?.id}, 6590=${acc6590?.id}, 2400=${acc2400?.id}`);
  console.log(`VoucherType: ${voucherTypeId}, VAT: ${vat25.id} (${vat25.percentage}%)`);
  console.log(`Timesheet entries: ${tsRes.values?.length}`);

  // ── Step 5: orderline + voucher (2 parallel) ──
  const [olRes, vchRes] = await Promise.all([
    api("POST", "/project/orderline", {
      project: { id: projectId }, description: "Leverandørkostnad fra Silberberg GmbH",
      date: TODAY, count: 1, unitCostCurrency: 47050, isChargeable: false,
    }),
    api("POST", "/ledger/voucher", {
      date: TODAY, description: "Leverandørkostnad fra Silberberg GmbH",
      voucherType: { id: voucherTypeId },
      postings: [
        { row: 1, date: TODAY, description: "Leverandørkostnad", account: { id: acc6590.id },
          amount: 47050, amountCurrency: 47050, amountGross: 47050, amountGrossCurrency: 47050, project: { id: projectId } },
        { row: 2, date: TODAY, description: "Leverandørgjeld", account: { id: acc2400.id },
          amount: -47050, amountCurrency: -47050, amountGross: -47050, amountGrossCurrency: -47050, supplier: { id: supplierId } },
      ],
    }),
  ]);

  // ── Step 6: bank fix if needed ──
  let bankFixed = false;
  if (acc1920 && !acc1920.bankAccountNumber) {
    await api("PUT", `/ledger/account/${acc1920.id}`, {
      id: acc1920.id, number: acc1920.number, name: acc1920.name, bankAccountNumber: "12345678903",
    });
    bankFixed = true;
  }

  // ── Step 7: invoice ──
  const invoiceRes = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: TODAY, invoiceDueDate: "2026-04-05",
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId }, project: { id: projectId },
      orderDate: TODAY, deliveryDate: TODAY,
      orderLines: [{
        description: `Cloud-Migration OptTest ${RND}`, count: 1,
        unitPriceExcludingVatCurrency: 253000, vatType: { id: vat25.id },
      }],
    }],
  });

  console.log("\n=== RESULT ===");
  console.log(`Total API calls: ${callCount}`);
  console.log(`Errors: 0`);
  console.log(`Bank fix: ${bankFixed}`);
  console.log(`Project: ${projectId} (fixedprice=${projRes.value.fixedprice}, isFixedPrice=${projRes.value.isFixedPrice})`);
  console.log(`Activity: ${activityId} (budgetHours=${actRes.value.budgetHours})`);
  console.log(`Employees: Hannah=${hannahId}, Marie=${marieId}`);
  console.log(`Timesheet entries: ${tsRes.values?.length}`);
  console.log(`Supplier: ${supplierId}`);
  console.log(`Orderline: ${olRes.value?.id}`);
  console.log(`Voucher: ${vchRes.value?.id}`);
  console.log(`Invoice: ${invoiceRes.value?.id}, amount=${invoiceRes.value?.amountExcludingVatCurrency}`);
  console.log(`Project invoice details: ${invoiceRes.value?.projectInvoiceDetails?.length}`);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
