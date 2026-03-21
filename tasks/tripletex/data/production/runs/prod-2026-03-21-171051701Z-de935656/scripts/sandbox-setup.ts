// Setup: create a fixture overdue invoice in sandbox for testing
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = BASE + path;
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  console.log(`\n>>> ${method} ${path}`);
  const r = await fetch(url, opts);
  const txt = await r.text();
  console.log(`Status: ${r.status}`);
  if (!r.ok) { console.error(txt); return null; }
  const json = JSON.parse(txt);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

// Check existing invoices first
const invoices = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-03-21&count=100&sorting=-invoiceDate&fields=*,customer(*)");
if (invoices) {
  console.log(`\nFound ${invoices.length} invoices:`);
  for (const inv of invoices) {
    const overdue = inv.invoiceDueDate < "2026-03-21" && (inv.amountOutstanding > 0 || inv.amountCurrencyOutstanding > 0);
    console.log(`  #${inv.invoiceNumber} id=${inv.id} due=${inv.invoiceDueDate} outstanding=${inv.amountCurrencyOutstanding} customer=${inv.customer?.id} ${overdue ? "OVERDUE" : ""}`);
  }
}
