const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (r.status >= 400) {
    console.log("ERROR:", JSON.stringify(json).slice(0, 800));
  }
  if (json.values !== undefined) return { _status: r.status, data: json.values };
  if (json.value !== undefined) return { _status: r.status, data: json.value };
  return { _status: r.status, data: json };
}

// Use sandbox-valid outgoing VAT (id=6, 0%) since sandbox doesn't have 25% in outgoing filter
const customerId = 108371825;
const projectId = 402016278;
const vatId = 6; // Only outgoing VAT in sandbox (0%)

const invRes = await api("POST", "/invoice?sendToCustomer=false", {
  invoiceDate: TODAY,
  invoiceDueDate: "2026-04-20",
  customer: { id: customerId },
  orders: [{
    customer: { id: customerId },
    project: { id: projectId },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [{
      description: "Cloud-Migration - Projektleistungen",
      count: 1,
      unitPriceExcludingVatCurrency: 253000,
      vatType: { id: vatId },
    }],
  }],
});

console.log("\nInvoice:", invRes._status);
if (invRes._status === 201) {
  const inv = invRes.data;
  console.log("Invoice ID:", inv.id);
  console.log("Invoice Number:", inv.invoiceNumber);
  console.log("Amount excl VAT:", inv.amountExcludingVatCurrency);
  console.log("Amount incl VAT:", inv.amount);
  const pid = inv.projectInvoiceDetails;
  console.log("projectInvoiceDetails count:", Array.isArray(pid) ? pid.length : "N/A");
  if (Array.isArray(pid) && pid.length > 0) {
    console.log("projectInvoiceDetails[0]:", JSON.stringify(pid[0]).slice(0, 300));
  }
} else {
  console.log("Invoice body:", JSON.stringify(invRes.data).slice(0, 1000));
}
