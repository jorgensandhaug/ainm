/**
 * Compare two invoice creation flows:
 * A) POST /invoice with embedded orders[] (current trusted standard)
 * B) POST /order then PUT /order/{id}/:invoice (tripletex2 strategy)
 *
 * Check what differences exist in the resulting invoice/order state.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const RUN = Date.now();
const TODAY = new Date().toISOString().slice(0, 10);
const h = { "Content-Type": "application/json", Authorization: AUTH };

let callCount = 0;
async function get(path: string) {
  callCount++;
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  console.log(`[${callCount}] GET ${path.split("?")[0]} → ${r.status}`);
  if (!r.ok) console.log(`  ERROR: ${JSON.stringify(b).slice(0, 300)}`);
  return { ok: r.ok, status: r.status, data: b };
}
async function post(path: string, body: any) {
  callCount++;
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  console.log(`[${callCount}] POST ${path.split("?")[0]} → ${r.status}`);
  if (!r.ok) console.log(`  ERROR: ${JSON.stringify(b).slice(0, 300)}`);
  return { ok: r.ok, status: r.status, data: b };
}
async function put(path: string, body?: any) {
  callCount++;
  const opts: any = { method: "PUT", headers: h };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  const b = await r.json();
  console.log(`[${callCount}] PUT ${path.split("?")[0]} → ${r.status}`);
  if (!r.ok) console.log(`  ERROR: ${JSON.stringify(b).slice(0, 300)}`);
  return { ok: r.ok, status: r.status, data: b };
}

async function main() {
  console.log(`=== COMPARE INVOICE FLOWS: ${TODAY} run=${RUN} ===\n`);

  // Setup: get VAT type and create two test customers + two projects
  const [vat, custA, custB] = await Promise.all([
    get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=" + TODAY + "&fields=id,name,percentage"),
    post("/customer", { name: `FlowTestA-${RUN}`, organizationNumber: "882854000", isCustomer: true }),
    post("/customer", { name: `FlowTestB-${RUN}`, organizationNumber: "930613118", isCustomer: true }),
  ]);
  const vatId = vat.data.values[0].id;
  const custAId = custA.data.value.id;
  const custBId = custB.data.value.id;

  // Get assignable PM
  const pm = await get("/employee?assignableProjectManagers=true&count=1&fields=id");
  const pmId = pm.data.values[0].id;

  // Create two projects (one per flow)
  const [projA, projB] = await Promise.all([
    post("/project", {
      name: `FlowA-${RUN}`,
      startDate: TODAY,
      customer: { id: custAId },
      projectManager: { id: pmId },
      isFixedPrice: true,
      fixedprice: 100000,
    }),
    post("/project", {
      name: `FlowB-${RUN}`,
      startDate: TODAY,
      customer: { id: custBId },
      projectManager: { id: pmId },
      isFixedPrice: true,
      fixedprice: 100000,
    }),
  ]);
  const pAId = projA.data.value.id;
  const pBId = projB.data.value.id;

  const dd = new Date(Date.UTC(+TODAY.slice(0,4), +TODAY.slice(5,7)-1, +TODAY.slice(8,10)+14)).toISOString().slice(0,10);

  // ═══════════════════════════════════════════════════════════════
  // FLOW A: POST /invoice with embedded orders[] (current standard)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n═══ FLOW A: POST /invoice with embedded orders[] ═══");
  const invA = await post("/invoice?sendToCustomer=false", {
    invoiceDate: TODAY, invoiceDueDate: dd, customer: { id: custAId },
    orders: [{
      customer: { id: custAId },
      project: { id: pAId },
      orderDate: TODAY, deliveryDate: TODAY,
      orderLines: [{
        description: `FlowA-${RUN}`,
        count: 1,
        unitPriceExcludingVatCurrency: 100000,
        vatType: { id: vatId },
      }],
    }],
  });

  // ═══════════════════════════════════════════════════════════════
  // FLOW B: POST /order then PUT /order/{id}/:invoice
  // ═══════════════════════════════════════════════════════════════
  console.log("\n═══ FLOW B: POST /order → PUT /order/:invoice ═══");
  const orderB = await post("/order", {
    customer: { id: custBId },
    project: { id: pBId },
    orderDate: TODAY, deliveryDate: TODAY,
    orderLines: [{
      description: `FlowB-${RUN}`,
      count: 1,
      unitPriceExcludingVatCurrency: 100000,
      vatType: { id: vatId },
    }],
  });
  const orderBId = orderB.data.value.id;

  const invB = await put(`/order/${orderBId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);

  // ═══════════════════════════════════════════════════════════════
  // COMPARE: Read back full state of both invoices
  // ═══════════════════════════════════════════════════════════════
  console.log("\n═══ COMPARE RESULTS ═══");

  const invAId = invA.data.value?.id;
  const invBId = invB.data.value?.id;

  if (!invAId) {
    console.log("FLOW A FAILED - no invoice ID");
  }
  if (!invBId) {
    console.log("FLOW B FAILED - no invoice ID");
  }

  // Read full invoice state
  const [fullA, fullB] = await Promise.all([
    invAId ? get(`/invoice/${invAId}?fields=*`) : Promise.resolve({ ok: false, data: null, status: 0 }),
    invBId ? get(`/invoice/${invBId}?fields=*`) : Promise.resolve({ ok: false, data: null, status: 0 }),
  ]);

  // Also read the orders
  const ordersA = invAId ? await get(`/invoice/${invAId}?fields=orders(*)`) : null;
  const ordersB = invBId ? await get(`/invoice/${invBId}?fields=orders(*)`) : null;

  // Print side by side comparison of key fields
  const fA = fullA.data?.value || {};
  const fB = fullB.data?.value || {};

  const fields = [
    "id", "invoiceNumber", "isApproved", "isCreditNote",
    "amountExcludingVatCurrency", "amountCurrencyOutstanding",
    "amountOutstanding", "amountRoundoff",
    "invoiceDate", "invoiceDueDate",
    "kid", "comment", "attention",
    "projectInvoiceDetails",
  ];

  console.log("\n--- KEY FIELD COMPARISON ---");
  console.log(`${"Field".padEnd(35)} | ${"FLOW A (POST /invoice)".padEnd(30)} | ${"FLOW B (order→:invoice)".padEnd(30)}`);
  console.log("-".repeat(100));
  for (const f of fields) {
    const vA = JSON.stringify(fA[f])?.slice(0, 28) || "undefined";
    const vB = JSON.stringify(fB[f])?.slice(0, 28) || "undefined";
    const match = vA === vB ? "  " : "⚠️";
    console.log(`${match} ${f.padEnd(33)} | ${vA.padEnd(30)} | ${vB.padEnd(30)}`);
  }

  // Also dump order status from both
  console.log("\n--- ORDER STATUS ---");
  const oA = ordersA?.data?.value?.orders || [];
  const oB = ordersB?.data?.value?.orders || [];
  console.log(`Flow A orders: ${JSON.stringify(oA.map((o: any) => ({ id: o.id, status: o.orderStatus || o.status, invoiceOnAccountAmountCurrency: o.invoiceOnAccountAmountCurrency })))}`);
  console.log(`Flow B orders: ${JSON.stringify(oB.map((o: any) => ({ id: o.id, status: o.orderStatus || o.status, invoiceOnAccountAmountCurrency: o.invoiceOnAccountAmountCurrency })))}`);

  // Dump full invoice A and B for detailed comparison
  console.log("\n--- FULL INVOICE A (POST /invoice) ---");
  console.log(JSON.stringify(fA, null, 2).slice(0, 2000));
  console.log("\n--- FULL INVOICE B (order→:invoice) ---");
  console.log(JSON.stringify(fB, null, 2).slice(0, 2000));

  // Also check: read back orders with full expansion
  if (oA.length > 0) {
    const orderAFull = await get(`/order/${oA[0].id}?fields=*`);
    console.log("\n--- FULL ORDER A ---");
    console.log(JSON.stringify(orderAFull.data?.value, null, 2).slice(0, 1500));
  }
  if (orderBId) {
    const orderBFull = await get(`/order/${orderBId}?fields=*`);
    console.log("\n--- FULL ORDER B ---");
    console.log(JSON.stringify(orderBFull.data?.value, null, 2).slice(0, 1500));
  }

  console.log(`\n=== DONE: ${callCount} total API calls ===`);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
