// Test: Create invoice with createOnAccount to see if it creates project-hours-linked invoice
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const AUTH = "Basic " + btoa("0:eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9");
const h = { "Content-Type": "application/json", Authorization: AUTH };
const TODAY = new Date().toISOString().slice(0, 10);

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json().catch(() => r.text());
  console.log(`GET ${path} -> ${r.status}`);
  if (!r.ok) { console.log("ERROR:", JSON.stringify(b).slice(0, 500)); return null; }
  return b;
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json().catch(() => r.text());
  console.log(`POST ${path} -> ${r.status}`);
  if (!r.ok) { console.log("ERROR:", JSON.stringify(b).slice(0, 500)); return null; }
  return b;
}
async function put(path: string, body?: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const b = await r.json().catch(() => r.text());
  console.log(`PUT ${path} -> ${r.status}`);
  if (!r.ok) { console.log("ERROR:", JSON.stringify(b).slice(0, 500)); return null; }
  return b;
}

async function main() {
  // Find the latest lifecycle test project
  const projects = await get(`/project?name=LifecycleTest&count=2&sorting=-id&fields=*,customer(*)`);
  // Use the FIRST one (oldest that hasn't been invoiced via createOnAccount yet)
  const proj = projects?.values?.[0];
  if (!proj) { console.log("No project found"); return; }
  console.log("Project:", proj.id, proj.name, "customer:", proj.customer?.id);

  // Check if this project already has an invoice reserve
  const reserve = await get(`/project/${proj.id}/period/invoicingReserve?dateFrom=${TODAY}&dateTo=2027-01-01`);
  console.log("\nReserve:", JSON.stringify(reserve, null, 2));

  // Try creating an empty order (no orderLines) with the project, then invoice with createOnAccount
  console.log("\n=== TEST 1: Empty order + createOnAccount ===");
  const emptyOrd = await post("/order", {
    customer: { id: proj.customer.id },
    project: { id: proj.id },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [], // no order lines!
  });

  if (emptyOrd?.value?.id) {
    console.log("Empty order created:", emptyOrd.value.id);
    // Try invoicing with createOnAccount
    const inv = await put(`/order/${emptyOrd.value.id}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false&createOnAccount=WITH_VAT&amountOnAccount=418100`);
    if (inv?.value?.id) {
      console.log("Invoice created:", inv.value.id);
      const invFull = await get(`/invoice/${inv.value.id}?fields=*,projectInvoiceDetails(*,project(*)),orderLines(*)`);
      console.log("\nInvoice details:");
      const pid = invFull?.value?.projectInvoiceDetails;
      if (pid) {
        for (const d of Array.isArray(pid) ? pid : [pid]) {
          console.log("  includeHours:", d.includeHours);
          console.log("  includeOrderLinesAndReinvoicing:", d.includeOrderLinesAndReinvoicing);
          console.log("  includeOnAccountBalance:", d.includeOnAccountBalance);
          console.log("  feeAmount:", d.feeAmount);
          console.log("  feeAmountCurrency:", d.feeAmountCurrency);
          console.log("  amountOrderLinesAndReinvoicing:", d.amountOrderLinesAndReinvoicing);
          console.log("  onAccountBalanceAmount:", d.onAccountBalanceAmount);
        }
      }
      console.log("amountExcludingVat:", invFull?.value?.amountExcludingVatCurrency);
      console.log("amountCurrency:", invFull?.value?.amountCurrency);
    }
  }

  // Try creating a POST /invoice directly with project embedded in orders[]
  console.log("\n=== TEST 2: POST /invoice with createOnAccount query param ===");
  const inv2 = await post(`/invoice?sendToCustomer=false&createOnAccount=WITH_VAT&amountOnAccount=100000`, {
    invoiceDate: TODAY,
    invoiceDueDate: 14,
    customer: { id: proj.customer.id },
    orders: [{
      customer: { id: proj.customer.id },
      project: { id: proj.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [],
    }],
    orderLines: [],
  });
  if (inv2?.value?.id) {
    console.log("Invoice2 created:", inv2.value.id);
    const invFull2 = await get(`/invoice/${inv2.value.id}?fields=*,projectInvoiceDetails(*,project(*))`);
    const pid2 = invFull2?.value?.projectInvoiceDetails;
    if (pid2) {
      for (const d of Array.isArray(pid2) ? pid2 : [pid2]) {
        console.log("  includeHours:", d.includeHours);
        console.log("  includeOnAccountBalance:", d.includeOnAccountBalance);
        console.log("  feeAmount:", d.feeAmount);
        console.log("  onAccountBalanceAmount:", d.onAccountBalanceAmount);
      }
    }
  }

  // Check project overallStatus after these invoices
  const status = await get(`/project/${proj.id}/period/overallStatus?dateFrom=2026-01-01&dateTo=2027-01-01&fields=*`);
  console.log("\nOverall status after:", JSON.stringify(status, null, 2));
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
