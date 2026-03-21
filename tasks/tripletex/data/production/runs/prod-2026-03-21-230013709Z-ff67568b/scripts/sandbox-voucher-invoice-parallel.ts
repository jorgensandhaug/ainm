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
  // Step 1: dept + customer + PM (3 parallel)
  const [deptRes, custRes, pmRes] = await Promise.all([
    api("GET", "/department?isInactive=false&count=1&fields=*"),
    api("POST", "/customer", { name: `ParTest ${RND} GmbH`, organizationNumber: "986645888" }),
    api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
  ]);
  const deptId = deptRes.values[0].id;
  const customerId = custRes.value.id;
  const pmManagerId = pmRes.values[0].id;

  // Step 2: batch employees + project (2 parallel)
  const [empBatchRes, projRes] = await Promise.all([
    api("POST", "/employee/list", [
      { firstName: "Hannah", lastName: `W${RND}`, email: `h-${RND}@example.org`, dateOfBirth: "1985-01-15", userType: "NO_ACCESS", department: { id: deptId } },
      { firstName: "Marie", lastName: `F${RND}`, email: `m-${RND}@example.org`, dateOfBirth: "1987-06-20", userType: "NO_ACCESS", department: { id: deptId } },
    ]),
    api("POST", "/project", {
      name: `ParallelTest ${RND}`, startDate: TODAY,
      customer: { id: customerId }, projectManager: { id: pmManagerId },
      isFixedPrice: true, fixedprice: 253000,
    }),
  ]);
  const hannahId = empBatchRes.values[0].id;
  const marieId = empBatchRes.values[1].id;
  const projectId = projRes.value.id;

  // Step 3: activity + batch participants (2 parallel)
  const [actRes] = await Promise.all([
    api("POST", "/project/projectActivity", {
      project: { id: projectId }, startDate: TODAY, budgetHours: 152, budgetFeeCurrency: 253000,
      activity: { name: "Prosjektaktivitet", activityType: "PROJECT_SPECIFIC_ACTIVITY", isChargeable: false },
    }),
    api("POST", "/project/participant/list", [
      { project: { id: projectId }, employee: { id: hannahId }, adminAccess: true },
      { project: { id: projectId }, employee: { id: marieId }, adminAccess: false },
    ]),
  ]);
  const activityId = actRes.value.activity.id;

  // Step 4: timesheet + supplier + accounts + voucherType + vatType + orderline (6 parallel)
  const hannahEntries = splitHours(34, TODAY).map(e => ({
    employee: { id: hannahId }, project: { id: projectId }, activity: { id: activityId }, date: e.date, hours: e.hours,
  }));
  const marieEntries = splitHours(118, TODAY).map(e => ({
    employee: { id: marieId }, project: { id: projectId }, activity: { id: activityId }, date: e.date, hours: e.hours,
  }));

  const [tsRes, suppRes, accRes, vtRes, vatRes, olRes] = await Promise.all([
    api("POST", "/timesheet/entry/list", [...hannahEntries, ...marieEntries]),
    api("POST", "/supplier", { name: `SilberPar ${RND} GmbH`, organizationNumber: "823323948" }),
    api("GET", "/ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber"),
    api("GET", `/ledger/voucherType?name=${encodeURIComponent("Leverandørfaktura")}&count=1&fields=id,name`),
    api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
    api("POST", "/project/orderline", {
      project: { id: projectId }, description: "Leverandørkostnad", date: TODAY, count: 1, unitCostCurrency: 47050, isChargeable: false,
    }),
  ]);

  const supplierId = suppRes.value.id;
  const accounts = accRes.values as any[];
  const acc1920 = accounts.find((a: any) => a.number === 1920);
  const acc6590 = accounts.find((a: any) => a.number === 6590);
  const acc2400 = accounts.find((a: any) => a.number === 2400);
  const voucherTypeId = vtRes.values[0].id;
  const vat25 = (vatRes.values as any[]).find((v: any) => v.percentage === 25.0) || vatRes.values[0];

  // Step 5: Check bank fix need
  const needsBankFix = acc1920 && !acc1920.bankAccountNumber;

  if (needsBankFix) {
    // Bank fix needed: voucher + bank fix parallel, then invoice
    await Promise.all([
      api("POST", "/ledger/voucher", {
        date: TODAY, description: "Leverandørkostnad",
        voucherType: { id: voucherTypeId },
        postings: [
          { row: 1, date: TODAY, description: "Leverandørkostnad", account: { id: acc6590.id },
            amount: 47050, amountCurrency: 47050, amountGross: 47050, amountGrossCurrency: 47050, project: { id: projectId } },
          { row: 2, date: TODAY, description: "Leverandørgjeld", account: { id: acc2400.id },
            amount: -47050, amountCurrency: -47050, amountGross: -47050, amountGrossCurrency: -47050, supplier: { id: supplierId } },
        ],
      }),
      api("PUT", `/ledger/account/${acc1920.id}`, {
        id: acc1920.id, number: acc1920.number, name: acc1920.name, bankAccountNumber: "12345678903",
      }),
    ]);
    // Step 6: invoice after bank fix
    const invoiceRes = await api("POST", "/invoice?sendToCustomer=false", {
      invoiceDate: TODAY, invoiceDueDate: "2026-04-05", customer: { id: customerId },
      orders: [{ customer: { id: customerId }, project: { id: projectId }, orderDate: TODAY, deliveryDate: TODAY,
        orderLines: [{ description: `ParallelTest ${RND}`, count: 1, unitPriceExcludingVatCurrency: 253000, vatType: { id: vat25.id } }],
      }],
    });
    console.log(`\nInvoice: ${invoiceRes.value?.id}, amount=${invoiceRes.value?.amountExcludingVatCurrency}, projDetails=${invoiceRes.value?.projectInvoiceDetails?.length}`);
  } else {
    // No bank fix: voucher + invoice PARALLEL
    console.log("\n=== TESTING VOUCHER + INVOICE PARALLEL ===");
    const [vchRes, invoiceRes] = await Promise.all([
      api("POST", "/ledger/voucher", {
        date: TODAY, description: "Leverandørkostnad",
        voucherType: { id: voucherTypeId },
        postings: [
          { row: 1, date: TODAY, description: "Leverandørkostnad", account: { id: acc6590.id },
            amount: 47050, amountCurrency: 47050, amountGross: 47050, amountGrossCurrency: 47050, project: { id: projectId } },
          { row: 2, date: TODAY, description: "Leverandørgjeld", account: { id: acc2400.id },
            amount: -47050, amountCurrency: -47050, amountGross: -47050, amountGrossCurrency: -47050, supplier: { id: supplierId } },
        ],
      }),
      api("POST", "/invoice?sendToCustomer=false", {
        invoiceDate: TODAY, invoiceDueDate: "2026-04-05", customer: { id: customerId },
        orders: [{ customer: { id: customerId }, project: { id: projectId }, orderDate: TODAY, deliveryDate: TODAY,
          orderLines: [{ description: `ParallelTest ${RND}`, count: 1, unitPriceExcludingVatCurrency: 253000, vatType: { id: vat25.id } }],
        }],
      }),
    ]);
    console.log(`Voucher: ${vchRes.value?.id}`);
    console.log(`Invoice: ${invoiceRes.value?.id}, amount=${invoiceRes.value?.amountExcludingVatCurrency}, projDetails=${invoiceRes.value?.projectInvoiceDetails?.length}`);
  }

  console.log(`\n=== TOTAL CALLS: ${callCount}, bank fix: ${needsBankFix} ===`);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
