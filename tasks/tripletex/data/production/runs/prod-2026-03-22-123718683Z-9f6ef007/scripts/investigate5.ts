// Test createOnAccount with correct dates
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const AUTH = "Basic " + btoa("0:eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9");
const h = { "Content-Type": "application/json", Authorization: AUTH };
const TODAY = new Date().toISOString().slice(0, 10);

// Calculate due date (14 days from today)
const dueDate = new Date();
dueDate.setDate(dueDate.getDate() + 14);
const DUE = dueDate.toISOString().slice(0, 10);

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
  // Find existing lifecycle project
  const projects = await get(`/project?name=LifecycleTest&count=1&sorting=-id&fields=*,customer(*)`);
  const proj = projects?.values?.[0];
  if (!proj) { console.log("No project found"); return; }
  console.log("Project:", proj.id, proj.name, "customer:", proj.customer?.id);

  // Check reserve
  const reserve = await get(`/project/${proj.id}/period/invoicingReserve?dateFrom=${TODAY}&dateTo=2027-01-01`);
  console.log("Reserve:", JSON.stringify(reserve?.value, null, 2));

  // Test A: POST /invoice with createOnAccount=WITH_VAT, correct dates
  console.log("\n=== TEST A: POST /invoice with createOnAccount ===");
  const invA = await post(`/invoice?sendToCustomer=false&createOnAccount=WITH_VAT&amountOnAccount=418100`, {
    invoiceDate: TODAY,
    invoiceDueDate: 14,
    invoiceDueDateType: "DAYS",
    customer: { id: proj.customer.id },
    orders: [{
      customer: { id: proj.customer.id },
      project: { id: proj.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: "A konto faktura",
        count: 1,
        unitPriceExcludingVatCurrency: 418100,
        vatType: { id: 3 },
      }],
    }],
  });

  if (invA?.value?.id) {
    const invFull = await get(`/invoice/${invA.value.id}?fields=*,projectInvoiceDetails(*,project(*)),orderLines(*,vatType(*))`);
    const pid = invFull?.value?.projectInvoiceDetails;
    console.log("Invoice A details:");
    if (Array.isArray(pid)) {
      for (const d of pid) {
        console.log("  includeHours:", d.includeHours);
        console.log("  includeOrderLinesAndReinvoicing:", d.includeOrderLinesAndReinvoicing);
        console.log("  includeOnAccountBalance:", d.includeOnAccountBalance);
        console.log("  onAccountBalanceAmount:", d.onAccountBalanceAmount);
        console.log("  feeAmount:", d.feeAmount);
        console.log("  feeAmountCurrency:", d.feeAmountCurrency);
      }
    }
    console.log("amountExcludingVatCurrency:", invFull?.value?.amountExcludingVatCurrency);
    console.log("amountCurrency:", invFull?.value?.amountCurrency);
    console.log("isApproved:", invFull?.value?.isApproved);
  }

  // Test B: POST /invoice with createOnAccount WITHOUT any order lines (minimal)
  console.log("\n=== TEST B: POST /invoice with createOnAccount, minimal order ===");
  const invB = await post(`/invoice?sendToCustomer=false&createOnAccount=WITH_VAT&amountOnAccount=10000`, {
    invoiceDate: TODAY,
    invoiceDueDate: 14,
    invoiceDueDateType: "DAYS",
    customer: { id: proj.customer.id },
    orders: [{
      customer: { id: proj.customer.id },
      project: { id: proj.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: "Placeholder",
        count: 1,
        unitPriceExcludingVatCurrency: 0.01,
        vatType: { id: 3 },
      }],
    }],
  });

  if (invB?.value?.id) {
    const invFull = await get(`/invoice/${invB.value.id}?fields=*,projectInvoiceDetails(*)`);
    const pid = invFull?.value?.projectInvoiceDetails;
    console.log("Invoice B details:");
    if (Array.isArray(pid)) {
      for (const d of pid) {
        console.log("  includeHours:", d.includeHours);
        console.log("  includeOnAccountBalance:", d.includeOnAccountBalance);
        console.log("  onAccountBalanceAmount:", d.onAccountBalanceAmount);
      }
    }
    console.log("amountExcludingVatCurrency:", invFull?.value?.amountExcludingVatCurrency);
  }

  // Test C: POST /order without orderLines, just with project link, then invoice with createOnAccount
  console.log("\n=== TEST C: Order without lines + createOnAccount ===");
  const ordC = await post("/order", {
    customer: { id: proj.customer.id },
    project: { id: proj.id },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [{
      description: "Placeholder",
      count: 1,
      unitPriceExcludingVatCurrency: 0.01,
      vatType: { id: 3 },
    }],
  });
  if (ordC?.value?.id) {
    const invC = await put(`/order/${ordC.value.id}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false&createOnAccount=WITH_VAT&amountOnAccount=50000`);
    if (invC?.value?.id) {
      const invFull = await get(`/invoice/${invC.value.id}?fields=*,projectInvoiceDetails(*)`);
      const pid = invFull?.value?.projectInvoiceDetails;
      console.log("Invoice C details:");
      if (Array.isArray(pid)) {
        for (const d of pid) {
          console.log("  includeHours:", d.includeHours);
          console.log("  includeOnAccountBalance:", d.includeOnAccountBalance);
          console.log("  onAccountBalanceAmount:", d.onAccountBalanceAmount);
          console.log("  feeAmount:", d.feeAmount);
        }
      }
      console.log("amountExcludingVatCurrency:", invFull?.value?.amountExcludingVatCurrency);
    }
  }

  // Check reserve after all tests
  const reserveAfter = await get(`/project/${proj.id}/period/invoicingReserve?dateFrom=${TODAY}&dateTo=2027-01-01`);
  console.log("\nReserve after:", JSON.stringify(reserveAfter?.value, null, 2));
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
