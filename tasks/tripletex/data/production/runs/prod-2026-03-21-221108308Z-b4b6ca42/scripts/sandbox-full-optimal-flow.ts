const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";
let callCount = 0;

async function api(method: string, path: string, body?: unknown) {
  callCount++;
  const url = BASE + path;
  console.log("\n[Call " + callCount + "] " + method + " " + url);
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log("  => " + res.status + " " + JSON.stringify(json).slice(0, 800));
  if (!res.ok) throw new Error(res.status + ": " + JSON.stringify(json).slice(0, 500));
  return json;
}

async function main() {
  const PRODUCTS = [
    { name: "Analysis Report SB2", number: 29796 },
    { name: "Maintenance SB2", number: 22145 },
    { name: "System Development SB2", number: 25995 },
  ];

  // Step 1: PARALLEL — batch create products + resolve customer + resolve VAT
  console.log("=== Step 1: Parallel batch ===");
  const results = await Promise.all([
    api("POST", "/product/list", PRODUCTS),
    api("GET", "/customer?fields=id,name&count=1"),
    api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=" + TODAY + "&fields=*"),
  ]);

  const productRes = results[0];
  const custRes = results[1];
  const vatRes = results[2];

  const products = productRes.values || [];
  const prodMap: any = {};
  for (const p of products) {
    prodMap[String(p.number)] = p.id;
    console.log("  Product: number=" + p.number + ", id=" + p.id + ", name=" + p.name);
  }

  const customerId = custRes.values[0].id;
  console.log("  Customer: id=" + customerId);

  const vatTypes = vatRes.values || [];
  for (const v of vatTypes) {
    console.log("  VAT: " + v.percentage + "% id=" + v.id + " code=" + v.number);
  }
  const vat0 = vatTypes.find(function(v: any) { return v.percentage === 0; });

  // Step 2: Create invoice
  console.log("\n=== Step 2: POST /invoice ===");
  const payload = {
    invoiceDate: TODAY,
    invoiceDueDate: "2026-04-20",
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [
        { description: "Analysis Report SB2", count: 1, unitPriceExcludingVatCurrency: 27700, vatType: { id: vat0.id }, product: { id: prodMap["29796"] } },
        { description: "Maintenance SB2", count: 1, unitPriceExcludingVatCurrency: 12700, vatType: { id: vat0.id }, product: { id: prodMap["22145"] } },
        { description: "System Development SB2", count: 1, unitPriceExcludingVatCurrency: 7050, vatType: { id: vat0.id }, product: { id: prodMap["25995"] } },
      ],
    }],
  };

  const invRes = await api("POST", "/invoice?sendToCustomer=false", payload);
  const invoiceId = invRes.value.id;
  console.log("\nInvoice id=" + invoiceId);
  console.log("  excl VAT: " + invRes.value.amountExcludingVatCurrency);
  console.log("  incl VAT: " + invRes.value.amountCurrency);

  // Step 3: Readback
  console.log("\n=== Step 3: Readback ===");
  const rb = await api("GET", "/invoice/" + invoiceId + "?fields=*,orders(*,orderLines(*,product(*),vatType(*)))");
  const lines = rb.value.orders[0].orderLines;
  for (const ol of lines) {
    console.log("  Line: desc=" + ol.description + " product.number=" + (ol.product && ol.product.number) + " price=" + ol.unitPriceExcludingVatCurrency);
  }

  console.log("\nTOTAL CALLS: " + callCount + " (3 parallel + 1 invoice + 1 readback)");
  console.log("Without readback: " + (callCount - 1) + " calls");
}

main().catch(function(e) { console.error("FATAL:", e.message); process.exit(1); });
