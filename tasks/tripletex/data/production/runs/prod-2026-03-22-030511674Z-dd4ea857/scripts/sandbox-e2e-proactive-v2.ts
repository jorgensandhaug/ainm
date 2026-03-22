// Sandbox E2E: verify proactive bank-account hedge path with 3 products
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  const j = await r.json();
  return { ok: r.ok, status: r.status, data: j };
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  return { ok: r.ok, status: r.status, data: j };
}

const today = new Date().toISOString().slice(0, 10);
const ts = Date.now();

// Setup: create 3 products with different VAT types using unique numbers
console.log("=== Setup ===");
const vatRes = await get("/ledger/vatType?count=100&fields=*");
const vats = vatRes.data.values;
const vat25 = vats.find((v: any) => v.percentage === 25 && v.number === 3); // Output VAT 25%
const vat15 = vats.find((v: any) => v.percentage === 15 && v.number === 32); // Output VAT medium
const vat0 = vats.find((v: any) => v.percentage === 0 && v.number === 6); // Output VAT exempt

// Print all vat types for reference
console.log("Available output VAT types:");
for (const v of vats) {
  if (v.percentage !== undefined && (v.name?.includes("utgående") || v.name?.includes("Fritatt"))) {
    console.log(`  id=${v.id} number=${v.number} pct=${v.percentage}% name=${v.name}`);
  }
}

const numA = `${ts}1`.slice(-8);
const numB = `${ts}2`.slice(-8);
const numC = `${ts}3`.slice(-8);

// Create products
const pA = await post("/product", { name: `Hedge Product A ${ts}`, number: numA, vatType: vat25 ? { id: vat25.id } : undefined });
const pB = await post("/product", { name: `Hedge Product B ${ts}`, number: numB, vatType: vat15 ? { id: vat15.id } : undefined });
const pC = await post("/product", { name: `Hedge Product C ${ts}`, number: numC, vatType: vat0 ? { id: vat0.id } : undefined });

console.log("Product A:", pA.ok ? `id=${pA.data.value.id} number=${numA}` : `FAILED: ${JSON.stringify(pA.data)}`);
console.log("Product B:", pB.ok ? `id=${pB.data.value.id} number=${numB}` : `FAILED: ${JSON.stringify(pB.data)}`);
console.log("Product C:", pC.ok ? `id=${pC.data.value.id} number=${numC}` : `FAILED: ${JSON.stringify(pC.data)}`);

if (!pA.ok || !pB.ok || !pC.ok) { console.error("Product setup failed"); process.exit(1); }

// Use existing customer
const custSearch = await get("/customer?count=1&fields=*");
const customer = custSearch.data.values[0];
console.log("Customer:", customer.id, customer.name);

console.log("\n=== Main flow: proactive hedge, 3 products ===");
let callCount = 0;

// CALL 1: GET customer (simulated — already have it)
callCount++;
console.log(`[${callCount}] GET /customer → already resolved`);

// CALL 2: GET products with vatType
callCount++;
const prodRes = await get(`/product?number=${numA},${numB},${numC}&fields=*,vatType(*)`);
console.log(`[${callCount}] GET /product?number=${numA},${numB},${numC}&fields=*,vatType(*) → ${prodRes.status}`);
const prods = prodRes.data.values;
console.log(`  Found: ${prods.length} products`);
for (const p of prods) {
  console.log(`  ${p.number}: id=${p.id}, vatPct=${p.vatType?.percentage}`);
}

// CALL 3: GET payment type
callCount++;
const ptRes = await get("/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
console.log(`[${callCount}] GET /invoice/paymentType → ${ptRes.status}`);
const pt = ptRes.data.values[0];
console.log(`  Using: ${pt.id} ${pt.description}`);

// CALL 4: Proactive bank-account check
callCount++;
const acctRes = await get("/ledger/account?isBankAccount=true&fields=*");
console.log(`[${callCount}] GET /ledger/account?isBankAccount=true → ${acctRes.status}`);
const needsRepair = acctRes.data.values.find((a: any) => a.isInvoiceAccount && !a.bankAccountNumber);
if (needsRepair) {
  callCount++;
  console.log(`[${callCount}] PUT /ledger/account/${needsRepair.id} (bank account repair)`);
  // Would do PUT here
} else {
  console.log("  Bank account already configured — no repair needed");
}

// Compute paidAmount
const lines = [
  { number: numA, description: "Hedge Product A", price: 24900 },
  { number: numB, description: "Hedge Product B", price: 14050 },
  { number: numC, description: "Hedge Product C", price: 15750 },
];

const orderLines: any[] = [];
let paidAmount = 0;
for (const l of lines) {
  const prod = prods.find((p: any) => String(p.number) === l.number);
  if (!prod) { console.error("Product not found:", l.number); process.exit(1); }
  const vatPct = prod.vatType?.percentage ?? 0;
  paidAmount += l.price * (1 + vatPct / 100);
  orderLines.push({
    product: { id: prod.id },
    description: l.description,
    count: 1,
    unitPriceExcludingVatCurrency: l.price,
  });
}
console.log("paidAmount:", paidAmount);

// CALL 5 (or 6 if repair was needed): POST invoice
callCount++;
const invRes = await post(
  `/invoice?sendToCustomer=false&paymentTypeId=${pt.id}&paidAmount=${paidAmount}`,
  {
    invoiceDate: today,
    invoiceDueDate: today,
    orders: [{
      customer: { id: customer.id },
      orderDate: today,
      deliveryDate: today,
      orderLines,
    }],
  }
);
console.log(`[${callCount}] POST /invoice → ${invRes.status}`);

if (!invRes.ok) {
  console.error("FAILED:", JSON.stringify(invRes.data));
  process.exit(1);
}

const inv = invRes.data.value;
console.log("\n=== Result ===");
console.log("Invoice ID:", inv.id, "Number:", inv.invoiceNumber);
console.log("amountOutstanding:", inv.amountOutstanding);
console.log("amountCurrencyOutstanding:", inv.amountCurrencyOutstanding);
console.log("Total API calls:", callCount);
console.log(inv.amountOutstanding === 0 ? "FULLY PAID — SUCCESS" : "WARNING: outstanding != 0");
