// Sandbox verification: Spanish "sin IVA" no-VAT create-and-send flow
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error(`${r.status} non-JSON: ${text.slice(0, 200)}`); }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log("  Error:", JSON.stringify(json).slice(0, 300)); }
  return { ok: r.ok, status: r.status, json };
}

// Step 1: Create customer + resolve VAT in parallel
const orgNum = "999" + Math.floor(100000 + Math.random() * 900000);
console.log("Using org number:", orgNum);

const [custRes, vatRes] = await Promise.all([
  api("POST", "/customer", {
    name: `Río Verde Sandbox ${orgNum} SL`,
    organizationNumber: orgNum,
    invoiceSendMethod: "MANUAL",
  }),
  api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*"),
]);

if (!custRes.ok) { console.log("Customer create failed"); process.exit(1); }
const customerId = custRes.json.value.id;
console.log("Customer ID:", customerId);

// Show all 0% VAT types
const vatTypes = vatRes.json.values;
const zeroVats = vatTypes.filter((v: any) => v.percentage === 0);
console.log("All 0% VAT types:", zeroVats.map((v: any) => `id=${v.id} code=${v.number} name=${v.name}`));

// Pick first 0% row (sandbox only has code 6)
const zeroVat = zeroVats[0];
if (!zeroVat) { console.log("No 0% VAT type found!"); process.exit(1); }
console.log("Using VAT type:", zeroVat.id, `code=${zeroVat.number}`, `${zeroVat.percentage}%`);

// Step 2: Create invoice
const invoicePayload = {
  invoiceDate: "2026-03-21",
  invoiceDueDate: "2026-04-20",
  customer: { id: customerId },
  orders: [{
    customer: { id: customerId },
    orderDate: "2026-03-21",
    deliveryDate: "2026-03-21",
    orderLines: [{
      description: "Sesión de formación",
      count: 1,
      unitPriceExcludingVatCurrency: 29100,
      vatType: { id: zeroVat.id },
    }],
  }],
};

const invRes = await api("POST", "/invoice?sendToCustomer=true", invoicePayload);
if (!invRes.ok) {
  console.log("Invoice create failed - checking if bank repair needed...");
  // Don't repair in sandbox - just report
  process.exit(1);
}

const inv = invRes.json.value;
console.log("\n=== Invoice Result ===");
console.log("Invoice ID:", inv.id);
console.log("Invoice Number:", inv.invoiceNumber);
console.log("amountExcludingVatCurrency:", inv.amountExcludingVatCurrency);
console.log("amountCurrency:", inv.amountCurrency);
console.log("Customer:", inv.customer?.id);

// Step 3: Readback to verify exact state
const readback = await api("GET", `/invoice/${inv.id}?fields=*,orders(*,orderLines(*,product(*),vatType(*)))`);
if (readback.ok) {
  const rb = readback.json.value;
  console.log("\n=== Readback Verification ===");
  console.log("amountExcludingVatCurrency:", rb.amountExcludingVatCurrency);
  console.log("amountCurrency:", rb.amountCurrency);
  console.log("isSent:", rb.isSent);
  const orders = rb.orders || [];
  for (const order of orders) {
    for (const line of (order.orderLines || [])) {
      console.log("  Line:", line.description, "price:", line.unitPriceExcludingVatCurrency, "vatType:", line.vatType?.number, line.vatType?.percentage + "%");
    }
  }
  console.log("\nVerification: amounts match no-VAT (0%):", rb.amountExcludingVatCurrency === rb.amountCurrency);
}

console.log("\nTotal calls: 2 parallel (customer+vat) + 1 invoice + 1 readback = 4 (readback is verification only, not needed in production)");
console.log("Production optimal: 3 calls (no bank repair) or 6 calls (with bank repair)");
