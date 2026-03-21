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
  return { status: res.status, json: json, ok: res.ok };
}

async function main() {
  // Use unique product numbers that won't collide
  const suffix = Date.now() % 100000;
  const PRODUCTS = [
    { name: "Analysis Report", number: 40000 + suffix },
    { name: "Maintenance", number: 50000 + suffix },
    { name: "System Development", number: 60000 + suffix },
  ];
  console.log("Product numbers: " + PRODUCTS.map(function(p) { return p.number; }).join(", "));

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

  if (!productRes.ok) throw new Error("Product batch create failed: " + productRes.status);

  const products = productRes.json.values || [];
  const prodMap: any = {};
  for (const p of products) {
    prodMap[String(p.number)] = p.id;
    console.log("  Product: number=" + p.number + ", id=" + p.id);
  }

  const customerId = custRes.json.values[0].id;
  console.log("  Customer: id=" + customerId);

  const vatTypes = vatRes.json.values || [];
  const vat0 = vatTypes.find(function(v: any) { return v.percentage === 0; });
  console.log("  VAT 0%: id=" + vat0.id);

  // Step 2: Create invoice with product references
  console.log("\n=== Step 2: POST /invoice ===");
  const line1Prod = prodMap[String(PRODUCTS[0].number)];
  const line2Prod = prodMap[String(PRODUCTS[1].number)];
  const line3Prod = prodMap[String(PRODUCTS[2].number)];

  const payload = {
    invoiceDate: TODAY,
    invoiceDueDate: "2026-04-20",
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [
        { description: "Analysis Report", count: 1, unitPriceExcludingVatCurrency: 27700, vatType: { id: vat0.id }, product: { id: line1Prod } },
        { description: "Maintenance", count: 1, unitPriceExcludingVatCurrency: 12700, vatType: { id: vat0.id }, product: { id: line2Prod } },
        { description: "System Development", count: 1, unitPriceExcludingVatCurrency: 7050, vatType: { id: vat0.id }, product: { id: line3Prod } },
      ],
    }],
  };

  const invRes = await api("POST", "/invoice?sendToCustomer=false", payload);
  if (!invRes.ok) throw new Error("Invoice failed: " + invRes.status);
  console.log("\nInvoice created: id=" + invRes.json.value.id);
  console.log("  excl VAT: " + invRes.json.value.amountExcludingVatCurrency);
  console.log("  incl VAT: " + invRes.json.value.amountCurrency);

  // Step 3: Readback to verify product linkage
  console.log("\n=== Step 3: Readback ===");
  const rb = await api("GET", "/invoice/" + invRes.json.value.id + "?fields=*,orders(*,orderLines(*,product(*),vatType(*)))");
  const lines = rb.json.value.orders[0].orderLines;
  for (const ol of lines) {
    const pn = ol.product ? ol.product.number : "null";
    const pname = ol.product ? ol.product.name : "null";
    console.log("  Line: desc=" + ol.description + " product.number=" + pn + " product.name=" + pname + " price=" + ol.unitPriceExcludingVatCurrency);
  }

  console.log("\n=== RESULT ===");
  console.log("TOTAL API CALLS: " + callCount);
  console.log("Without readback: " + (callCount - 1) + " calls (optimal for production)");
  console.log("Happy path = 4 calls (3 parallel + 1 invoice)");
  console.log("With bank repair = 7 calls (3 parallel + 1 failed invoice + 1 GET account + 1 PUT account + 1 retry invoice)");
}

main().catch(function(e) { console.error("FATAL:", e.message); process.exit(1); });
