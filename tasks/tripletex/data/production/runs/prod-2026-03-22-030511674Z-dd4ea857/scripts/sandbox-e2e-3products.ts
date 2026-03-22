// Sandbox E2E: 3-product invoice with proactive bank-account hedge
// Proves the 5-call path (bank acct exists) or 6-call path (bank acct missing)

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };
let callCount = 0;

async function get(path: string) {
  callCount++;
  const r = await fetch(`${BASE}${path}`, { headers: H });
  const j = await r.json();
  console.log(`[${callCount}] GET ${path} → ${r.status}`);
  if (!r.ok) { console.error(JSON.stringify(j)); process.exit(1); }
  return j;
}

async function post(path: string, body: any) {
  callCount++;
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  console.log(`[${callCount}] POST ${path} → ${r.status}`);
  return { ok: r.ok, status: r.status, data: j };
}

async function put(path: string, body: any) {
  callCount++;
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  console.log(`[${callCount}] PUT ${path} → ${r.status}`);
  if (!r.ok) { console.error(JSON.stringify(j)); process.exit(1); }
  return j;
}

const today = new Date().toISOString().slice(0, 10);

// First, create test entities (not counted in the main flow)
console.log("=== Setup: creating test customer + 3 products ===");
callCount = 0; // reset for setup

// Create customer
const custSetup = await post("/customer", {
  name: "Proactive Hedge Test Customer",
  organizationNumber: "200000003",
  email: "test@hedge.example",
  isCustomer: true,
});
if (!custSetup.ok) {
  // Customer may already exist
  console.log("Customer create failed, trying search...");
  const existing = await get("/customer?organizationNumber=200000003&fields=*");
  if (existing.values.length > 0) {
    console.log("Using existing customer:", existing.values[0].id);
    var customerId = existing.values[0].id;
  } else {
    console.error("Cannot create or find customer");
    process.exit(1);
  }
} else {
  var customerId = custSetup.data.value.id;
}
console.log("Customer ID:", customerId);

// Create 3 products with different VAT types
// First get available vatTypes
const vatTypes = await get("/ledger/vatType?count=100&fields=*");
const vat25 = vatTypes.values.find((v: any) => v.percentage === 25 && v.name?.includes("Høy"));
const vat15 = vatTypes.values.find((v: any) => v.percentage === 15);
const vat0 = vatTypes.values.find((v: any) => v.percentage === 0 && (v.name?.includes("Ingen") || v.name?.includes("Fritt")));

console.log("VAT types:", {
  vat25: vat25 ? `${vat25.id} (${vat25.percentage}% ${vat25.name})` : "NOT FOUND",
  vat15: vat15 ? `${vat15.id} (${vat15.percentage}% ${vat15.name})` : "NOT FOUND",
  vat0: vat0 ? `${vat0.id} (${vat0.percentage}% ${vat0.name})` : "NOT FOUND",
});

// Create products
const products: any[] = [];
const productDefs = [
  { number: "9001", name: "Hedge Test Product A", vatTypeId: vat25?.id },
  { number: "9002", name: "Hedge Test Product B", vatTypeId: vat15?.id },
  { number: "9003", name: "Hedge Test Product C", vatTypeId: vat0?.id },
];

for (const pd of productDefs) {
  const pRes = await post("/product", {
    name: pd.name,
    number: pd.number,
    vatType: pd.vatTypeId ? { id: pd.vatTypeId } : undefined,
  });
  if (pRes.ok) {
    products.push(pRes.data.value);
    console.log(`Created product ${pd.number}: id=${pRes.data.value.id}`);
  } else {
    // Try to find existing
    const existing = await get(`/product?number=${pd.number}&fields=*,vatType(*)`);
    if (existing.values.length > 0) {
      products.push(existing.values[0]);
      console.log(`Found existing product ${pd.number}: id=${existing.values[0].id}`);
    }
  }
}

console.log("\n=== Main flow: 3-product invoice with proactive hedge ===");
callCount = 0; // Reset counter for the main flow

// CALL 1: GET customer
const custRes = await get("/customer?organizationNumber=200000003&fields=*");
const customer = custRes.values[0];
console.log("Customer:", customer.id, customer.name);

// CALL 2: GET products with vatType expansion
const prodRes = await get("/product?number=9001,9002,9003&fields=*,vatType(*)");
const prods = prodRes.values;
console.log("Products found:", prods.length);
for (const p of prods) {
  console.log(`  ${p.number}: id=${p.id}, vatPct=${p.vatType?.percentage}`);
}

// CALL 3: GET payment types
const ptRes = await get("/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
const paymentType = ptRes.values[0];
console.log("PaymentType:", paymentType.id, paymentType.description);

// CALL 4: Proactive bank-account hedge
const acctRes = await get("/ledger/account?isBankAccount=true&fields=*");
const invoiceAcct = acctRes.values.find((a: any) => a.isInvoiceAccount && !a.bankAccountNumber);
if (invoiceAcct) {
  console.log("Bank account missing, fixing...");
  // CALL 5 (conditional): PUT bank account
  await put(`/ledger/account/${invoiceAcct.id}`, {
    ...invoiceAcct,
    bankAccountNumber: "12345678903",
  });
}

// Compute paidAmount from VAT percentages
const lines = [
  { number: "9001", description: "Product A", price: 24900 },
  { number: "9002", description: "Product B", price: 14050 },
  { number: "9003", description: "Product C", price: 15750 },
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

// CALL 5 or 6: POST invoice
const invRes = await post(
  `/invoice?sendToCustomer=false&paymentTypeId=${paymentType.id}&paidAmount=${paidAmount}`,
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

if (!invRes.ok) {
  console.error("POST /invoice failed:", invRes.status, JSON.stringify(invRes.data));
  process.exit(1);
}

const inv = invRes.data.value;
console.log("\n=== Result ===");
console.log("Invoice ID:", inv.id, "Number:", inv.invoiceNumber);
console.log("amountOutstanding:", inv.amountOutstanding);
console.log("amountCurrencyOutstanding:", inv.amountCurrencyOutstanding);
console.log("Total API calls in main flow:", callCount);
console.log("Errors:", 0);
console.log(inv.amountOutstanding === 0 && inv.amountCurrencyOutstanding === 0 ? "FULLY PAID" : "WARNING: outstanding != 0");
