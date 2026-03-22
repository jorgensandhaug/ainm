/**
 * Deep debug: Investigate the state of all task 29 entities after creation.
 * Focus on: booking status, posting status, approval, sendToLedger,
 * invoice isSent/isBooked, voucher status, timesheet approval.
 *
 * Goal: find what the scorer might check beyond entity existence.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = new Date().toISOString().slice(0, 10);
const RUN = `dbg-${Date.now()}`;
const h = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { ...h } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, ok: r.ok, data };
}

async function get(p: string) { return api("GET", p); }
async function post(p: string, b: any) { return api("POST", p, b); }
async function put(p: string, b: any) { return api("PUT", p, b); }

function splitHours(total: number, start: string) {
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
  console.log("=== TASK 29 DEEP STATE DEBUG ===\n");

  // ── First, create a full lifecycle (minimal logging) ──
  const [dept, pm, acct, vt, vat] = (await Promise.all([
    get("/department?isInactive=false&count=1&fields=*"),
    get("/employee?assignableProjectManagers=true&count=1&fields=*"),
    get("/ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber"),
    get("/ledger/voucherType?name=Leverandørfaktura&count=1&fields=id,name"),
    get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=" + TODAY + "&fields=id,name,percentage"),
  ])).map(r => r.data);

  const deptId = dept.values[0].id;
  const pmAssId = pm.values[0].id;
  const a6590 = acct.values.find((a: any) => a.number === 6590);
  const a2400 = acct.values.find((a: any) => a.number === 2400);
  const vtId = vt.values[0].id;
  const vatId = vat.values[0].id;

  const cust = await post("/customer", { name: `DebugCo ${RUN}`, organizationNumber: "932075482", isCustomer: true });
  const custId = cust.data.value.id;

  const [emps, proj] = (await Promise.all([
    post("/employee/list", [
      { firstName: "Alice", lastName: "Debug", email: `alice-${RUN}@example.org`, dateOfBirth: "1988-01-01", userType: "NO_ACCESS", department: { id: deptId } },
      { firstName: "Bob", lastName: "Debug", email: `bob-${RUN}@example.org`, dateOfBirth: "1992-01-01", userType: "NO_ACCESS", department: { id: deptId } },
    ]),
    post("/project", { name: `Debug Project ${RUN}`, startDate: TODAY, customer: { id: custId }, projectManager: { id: pmAssId }, isFixedPrice: true, fixedprice: 100000 }),
  ])).map(r => r.data);

  const e1 = emps.values[0].id, e2 = emps.values[1].id, pId = proj.value.id;

  const [act] = (await Promise.all([
    post("/project/projectActivity", { project: { id: pId }, startDate: TODAY, budgetHours: 30, budgetFeeCurrency: 100000, activity: { name: "Prosjektaktivitet", activityType: "PROJECT_SPECIFIC_ACTIVITY", isChargeable: false } }),
    post("/project/participant/list", [
      { project: { id: pId }, employee: { id: e1 }, adminAccess: true },
      { project: { id: pId }, employee: { id: e2 }, adminAccess: false },
    ]),
  ])).map(r => r.data);
  const actId = act.value.activity.id;

  const ts1 = splitHours(15, TODAY).map(e => ({ employee: { id: e1 }, project: { id: pId }, activity: { id: actId }, date: e.date, hours: e.hours }));
  const ts2 = splitHours(15, TODAY).map(e => ({ employee: { id: e2 }, project: { id: pId }, activity: { id: actId }, date: e.date, hours: e.hours }));

  const [, supp] = (await Promise.all([
    post("/timesheet/entry/list", [...ts1, ...ts2]),
    post("/supplier", { name: `SupDebug ${RUN}`, organizationNumber: "889264985", isSupplier: true }),
    post("/project/orderline", { project: { id: pId }, description: "Leverandørkostnad", date: TODAY, count: 1, unitCostCurrency: 25000, isChargeable: false }),
  ])).map(r => r.data);
  const sId = supp.value.id;

  const dd = new Date(Date.UTC(+TODAY.slice(0,4), +TODAY.slice(5,7)-1, +TODAY.slice(8,10)+14)).toISOString().slice(0,10);

  // Create voucher and invoice WITHOUT any special flags first
  const [vouch, inv] = (await Promise.all([
    post("/ledger/voucher", {
      date: TODAY, description: "Leverandørkostnad", voucherType: { id: vtId },
      postings: [
        { row: 1, date: TODAY, description: "Leverandørkostnad", account: { id: a6590!.id }, amount: 25000, amountCurrency: 25000, amountGross: 25000, amountGrossCurrency: 25000, project: { id: pId } },
        { row: 2, date: TODAY, description: "Leverandørgjeld", account: { id: a2400!.id }, amount: -25000, amountCurrency: -25000, amountGross: -25000, amountGrossCurrency: -25000, supplier: { id: sId } },
      ],
    }),
    post("/invoice?sendToCustomer=false", {
      invoiceDate: TODAY, invoiceDueDate: dd, customer: { id: custId },
      orders: [{ customer: { id: custId }, project: { id: pId }, orderDate: TODAY, deliveryDate: TODAY,
        orderLines: [{ description: `Debug Project ${RUN}`, count: 1, unitPriceExcludingVatCurrency: 100000, vatType: { id: vatId } }],
      }],
    }),
  ])).map(r => r.data);

  const vouchId = vouch.value.id;
  const invId = inv.value.id;

  console.log(`Created: project=${pId} invoice=${invId} voucher=${vouchId}\n`);

  // ══════════════════════════════════════════════════════════════
  // NOW: Deep inspect ALL entity states
  // ══════════════════════════════════════════════════════════════

  // 1. INVOICE — dump ALL fields
  console.log("═══ INVOICE (fields=*) ═══");
  const invFull = await get(`/invoice/${invId}?fields=*`);
  const i = invFull.data.value;
  const invoiceKeys = ["id", "invoiceNumber", "invoiceDate", "invoiceDueDate", "isCreditNote", "isApproved",
    "sentDate", "amountExcludingVat", "amountExcludingVatCurrency", "amountIncludingVat", "amountIncludingVatCurrency",
    "amountOutstanding", "amountOutstandingTotal", "amountCurrency", "currency",
    "ehfSendStatus", "postings", "voucher", "voucherId", "projectInvoiceDetails",
    "isPeriodizationPossible", "isChargeable"];
  for (const k of invoiceKeys) {
    const v = i[k];
    if (v !== undefined && v !== null) {
      console.log(`  ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
    }
  }
  // Also dump any field containing "send", "book", "post", "approv", "ledger", "status"
  for (const [k, v] of Object.entries(i)) {
    if (/send|book|post|approv|ledger|status|paid|lock|close/i.test(k) && v !== undefined && v !== null) {
      console.log(`  [state] ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
    }
  }

  // 2. Check if invoice has a voucher (= booked to ledger)
  console.log(`\n  voucher: ${JSON.stringify(i.voucher)}`);
  console.log(`  voucherId: ${i.voucherId}`);

  // 3. Try POST /invoice with sendToCustomer=false AND check for booking parameters
  console.log("\n═══ INVOICE ENDPOINT EXPLORATION ═══");

  // Try creating invoice with sendToLedger=true
  console.log("\n  Trying POST /invoice?sendToCustomer=false&sendToLedger=true ...");
  const inv2 = await post("/invoice?sendToCustomer=false&sendToLedger=true", {
    invoiceDate: TODAY, invoiceDueDate: dd, customer: { id: custId },
    orders: [{ customer: { id: custId }, project: { id: pId }, orderDate: TODAY, deliveryDate: TODAY,
      orderLines: [{ description: "Test sendToLedger", count: 1, unitPriceExcludingVatCurrency: 1000, vatType: { id: vatId } }],
    }],
  });
  console.log(`  Status: ${inv2.status}`);
  if (inv2.ok) {
    const i2 = inv2.data.value;
    console.log(`  id=${i2.id} voucher=${JSON.stringify(i2.voucher)} voucherId=${i2.voucherId}`);
    // Compare voucher presence
    const i2Full = await get(`/invoice/${i2.id}?fields=*`);
    const i2v = i2Full.data.value;
    console.log(`  Has voucher: ${!!i2v.voucher} voucherId: ${i2v.voucherId}`);
    for (const [k, v] of Object.entries(i2v)) {
      if (/send|book|post|approv|ledger|status|paid|lock/i.test(k) && v !== undefined && v !== null) {
        console.log(`  [state] ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
      }
    }
  }

  // 4. Try invoice :createBookkeepingJournal or similar actions
  console.log("\n  Trying PUT /invoice/" + invId + "/:send ...");
  const sendRes = await api("PUT", `/invoice/${invId}/:send`, { sendType: "JOURNAL_ENTRY" });
  console.log(`  Status: ${sendRes.status} ${JSON.stringify(sendRes.data).slice(0, 200)}`);

  // 5. Check the VOUCHER state (our manual supplier voucher)
  console.log("\n═══ VOUCHER (fields=*) ═══");
  const vFull = await get(`/ledger/voucher/${vouchId}?fields=*`);
  const v = vFull.data.value;
  for (const [k, val] of Object.entries(v)) {
    if (val !== undefined && val !== null && val !== "" && !(Array.isArray(val) && val.length === 0)) {
      console.log(`  ${k}: ${typeof val === "object" ? JSON.stringify(val).slice(0, 200) : val}`);
    }
  }

  // 6. Check timesheet entry states (approved? locked?)
  console.log("\n═══ TIMESHEET ENTRIES ═══");
  const tsEntries = await get(`/timesheet/entry?projectId=${pId}&dateFrom=${TODAY}&dateTo=2027-01-01&fields=*&count=5`);
  if (tsEntries.ok) {
    const te = tsEntries.data.values?.[0];
    if (te) {
      for (const [k, val] of Object.entries(te)) {
        if (val !== undefined && val !== null) {
          console.log(`  ${k}: ${typeof val === "object" ? JSON.stringify(val).slice(0, 100) : val}`);
        }
      }
    }
  }

  // 7. Check project for any "status" or "phase" fields
  console.log("\n═══ PROJECT STATE ═══");
  const pFull = await get(`/project/${pId}?fields=*`);
  const p = pFull.data.value;
  for (const [k, val] of Object.entries(p)) {
    if (/status|phase|close|lock|approv|book|post|complete|invoice|reserve|budget|fixed/i.test(k) && val !== undefined && val !== null) {
      console.log(`  ${k}: ${typeof val === "object" ? JSON.stringify(val).slice(0, 200) : val}`);
    }
  }

  // 8. Check if there's an invoice/:createBookkeepingJournal endpoint
  console.log("\n═══ INVOICE ACTION ENDPOINTS ═══");
  for (const action of [":createBookkeepingJournal", ":book", ":post", ":approve", ":sendToLedger"]) {
    const r = await api("PUT", `/invoice/${invId}/${action}`);
    console.log(`  PUT /invoice/${invId}/${action}: ${r.status} ${JSON.stringify(r.data).slice(0, 150)}`);
  }

  // 9. Check if order has any booking/approval status
  console.log("\n═══ ORDER STATE ═══");
  const orders = await get(`/order?orderDateFrom=${TODAY}&orderDateTo=2027-01-01&customerId=${custId}&fields=*&count=5`);
  if (orders.ok) {
    const o = orders.data.values?.[0];
    if (o) {
      for (const [k, val] of Object.entries(o)) {
        if (/status|invoic|book|approv|close|lock|prepared|complete/i.test(k) && val !== undefined && val !== null) {
          console.log(`  ${k}: ${typeof val === "object" ? JSON.stringify(val).slice(0, 200) : val}`);
        }
      }
    }
  }

  // 10. Check the project for invoiceReserveTotalAmountCurrency
  console.log("\n═══ INVOICE RESERVE ═══");
  console.log(`  invoiceReserveTotalAmountCurrency: ${p.invoiceReserveTotalAmountCurrency}`);
  console.log(`  fixedprice: ${p.fixedprice}`);
  console.log(`  isFixedPrice: ${p.isFixedPrice}`);

  // 11. Now try creating an invoice with createBackOrder=false parameter
  console.log("\n═══ INVOICE PARAMETER EXPLORATION ═══");
  const inv3 = await post("/invoice?sendToCustomer=false&createBackOrder=false", {
    invoiceDate: TODAY, invoiceDueDate: dd, customer: { id: custId },
    orders: [{ customer: { id: custId }, project: { id: pId }, orderDate: TODAY, deliveryDate: TODAY,
      orderLines: [{ description: "Test createBackOrder", count: 1, unitPriceExcludingVatCurrency: 500, vatType: { id: vatId } }],
    }],
  });
  console.log(`  POST /invoice?sendToCustomer=false&createBackOrder=false: ${inv3.status}`);

  // 12. Check if we need to "close" or mark the project as complete
  console.log("\n═══ PROJECT ACTIONS ═══");
  for (const action of [":close", ":complete", ":approve"]) {
    const r = await api("PUT", `/project/${pId}/${action}`);
    console.log(`  PUT /project/${pId}/${action}: ${r.status} ${JSON.stringify(r.data).slice(0, 150)}`);
  }

  // 13. Check if the invoice needs to be "booked" via the order
  console.log("\n═══ ORDER INVOICE ACTIONS ═══");
  if (orders.ok && orders.data.values?.[0]) {
    const orderId = orders.data.values[0].id;
    const r = await api("PUT", `/order/${orderId}/:invoice`);
    console.log(`  PUT /order/${orderId}/:invoice: ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
  }

  // 14. Check available OpenAPI paths for invoice
  console.log("\n═══ OPENAPI INVOICE PATHS ═══");
  // Try fetching the openapi spec to find invoice-related endpoints
  const spec = await get("/swagger.json");
  if (spec.ok && spec.data.paths) {
    const invoicePaths = Object.keys(spec.data.paths).filter((p: string) => p.includes("invoice"));
    for (const ip of invoicePaths.sort()) {
      const methods = Object.keys(spec.data.paths[ip]).filter(m => m !== "parameters");
      console.log(`  ${methods.join(",").toUpperCase()} ${ip}`);
    }
  }
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
