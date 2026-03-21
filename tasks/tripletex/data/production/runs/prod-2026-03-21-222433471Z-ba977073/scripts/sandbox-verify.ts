// Sandbox verification: confirm the 6-call path works end-to-end
// and that top-level orderLines fails as documented

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
  if (!r.ok) {
    console.log("  ERROR:", JSON.stringify(json).slice(0, 500));
  }
  if (json?.values !== undefined) return { ok: r.ok, data: json.values };
  if (json?.value !== undefined) return { ok: r.ok, data: json.value };
  return { ok: r.ok, data: json };
}

async function main() {
  // First, create a disposable overdue invoice for testing
  // Get an existing customer
  const custRes = await api("GET", "/customer?count=1&fields=*");
  if (!custRes.ok || !custRes.data.length) { console.log("No customers"); return; }
  const cust = custRes.data[0];
  console.log(`Using customer: id=${cust.id} name=${cust.name}`);

  // Create a backdated invoice that will be overdue
  const invRes = await api("POST", "/invoice", {
    invoiceDate: "2026-02-01",
    invoiceDueDate: "2026-02-15",
    customer: { id: cust.id },
    orders: [{
      customer: { id: cust.id },
      orderDate: "2026-02-01",
      deliveryDate: "2026-02-01",
      orderLines: [{
        description: "Test overdue item",
        count: 1,
        unitPriceExcludingVatCurrency: 8000,
      }],
    }],
  });
  if (!invRes.ok) { console.log("Failed to create fixture invoice"); return; }
  console.log(`Fixture invoice: id=${invRes.data.id} #${invRes.data.invoiceNumber} outstanding=${invRes.data.amountCurrencyOutstanding}`);

  // Now test the failing pattern: top-level orderLines with empty orders
  console.log("\n--- TEST: top-level orderLines with orders: [] ---");
  const badRes = await api("POST", "/invoice", {
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    customer: { id: cust.id },
    orders: [],
    orderLines: [{
      description: "Mahngebühr",
      count: 1,
      unitPriceExcludingVatCurrency: 40,
    }],
  });
  console.log(`Result: ok=${badRes.ok}`);

  // Test the correct pattern: orderLines inside orders[]
  console.log("\n--- TEST: orderLines inside orders[] ---");
  const goodRes = await api("POST", "/invoice", {
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    customer: { id: cust.id },
    orders: [{
      customer: { id: cust.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: "Mahngebühr",
        count: 1,
        unitPriceExcludingVatCurrency: 40,
      }],
    }],
  });
  console.log(`Result: ok=${goodRes.ok} id=${goodRes.data?.id} amount=${goodRes.data?.amountCurrency}`);
}

main().catch(e => console.error("FATAL:", e));
