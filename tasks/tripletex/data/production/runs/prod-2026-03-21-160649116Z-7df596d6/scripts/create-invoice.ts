const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "VDAYE9JwN6K-wWOhjKCExQsbQDpjyMKCDb13Pq-F_LE";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`\n>>> ${method} ${url}`);
  const res = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json();
  console.log(`Status: ${res.status}`);
  if (res.status === 403) { console.error("BLOCKED:", JSON.stringify(json)); process.exit(1); }
  return { status: res.status, json };
}

// 1. Resolve customer
const c = await api("GET", "/customer?organizationNumber=875483811&fields=*");
const cust = c.json.values?.[0];
if (!cust) { console.error("Customer not found"); process.exit(1); }
console.log("Customer:", cust.id, cust.name);

// 2. Resolve products by number
const pr = await api("GET", "/product?productNumber=5679&productNumber=9191&productNumber=5577&fields=*");
let prods = pr.json.values || [];
let byNum: Record<string, any> = {};
for (const p of prods) byNum[String(p.number)] = p;

// Fallback to catalog if incomplete
if (!byNum["5679"] || !byNum["9191"] || !byNum["5577"]) {
  console.log("Product number query incomplete, falling back to catalog...");
  const cat = await api("GET", "/product?count=1000&fields=*");
  prods = cat.json.values || [];
  byNum = {};
  for (const p of prods) byNum[String(p.number)] = p;
}

const p1 = byNum["5679"]; // Heures de conseil, 10950, 25%
const p2 = byNum["9191"]; // Maintenance, 13750, 15%
const p3 = byNum["5577"]; // Rapport d'analyse, 16400, 0%
if (!p1 || !p2 || !p3) { console.error("Products missing:", !!p1, !!p2, !!p3); process.exit(1); }
console.log("Products:", p1.id, p1.name, "|", p2.id, p2.name, "|", p3.id, p3.name);

// Check if any product lacks vatType.id — if so, need vatType lookup
let needVatLookup = false;
const wantedVat: Record<string, { pct: number; name: string }> = {
  "5679": { pct: 25, name: "standard" },
  "9191": { pct: 15, name: "food" },
  "5577": { pct: 0, name: "exempt" },
};
for (const [num, prod] of Object.entries({ "5679": p1, "9191": p2, "5577": p3 })) {
  if (!prod.vatType?.id) { needVatLookup = true; break; }
}

let vatMap: Record<number, number> = {}; // pct -> vatType id
if (needVatLookup) {
  console.log("Need VAT lookup (product missing vatType.id)...");
  const vr = await api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*");
  const vatTypes = vr.json.values || [];
  for (const vt of vatTypes) {
    if (vt.percentage === 25 && !vatMap[25]) vatMap[25] = vt.id;
    if (vt.percentage === 15 && !vatMap[15]) vatMap[15] = vt.id;
    if (vt.percentage === 0 && !vatMap[0]) vatMap[0] = vt.id;
  }
}

function lineVat(prod: any, pct: number) {
  if (prod.vatType?.id) return { id: prod.vatType.id };
  if (vatMap[pct]) return { id: vatMap[pct] };
  return undefined;
}

const today = "2026-03-21";
const payload = {
  invoiceDate: today,
  invoiceDueDate: today,
  customer: { id: cust.id },
  orders: [{
    orderDate: today,
    deliveryDate: today,
    customer: { id: cust.id },
    orderLines: [
      { product: { id: p1.id }, count: 1, unitPriceExcludingVatCurrency: 10950, vatType: lineVat(p1, 25) },
      { product: { id: p2.id }, count: 1, unitPriceExcludingVatCurrency: 13750, vatType: lineVat(p2, 15) },
      { product: { id: p3.id }, count: 1, unitPriceExcludingVatCurrency: 16400, vatType: lineVat(p3, 0) },
    ],
  }],
};

// 3. POST invoice
let inv = await api("POST", "/invoice?sendToCustomer=false", payload);

// Handle bank account error
if (inv.status >= 400 && inv.status !== 403) {
  const err = JSON.stringify(inv.json).toLowerCase();
  if (err.includes("bank") || err.includes("konto") || err.includes("account")) {
    console.log("\nFixing bank account...");
    const ba = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
    const acct = ba.json.values?.[0];
    if (acct) {
      acct.bank = acct.bank || {};
      acct.bank.bankAccountNumber = "86011117947";
      await api("PUT", `/ledger/account/${acct.id}`, acct);
      inv = await api("POST", "/invoice?sendToCustomer=false", payload);
    }
  }
}

if (inv.status >= 200 && inv.status < 300) {
  const v = inv.json.value;
  console.log("\n=== INVOICE CREATED ===");
  console.log("ID:", v?.id, "| Number:", v?.invoiceNumber);
  console.log("Amount excl VAT:", v?.amountExcludingVatCurrency);
  console.log("Amount incl VAT:", v?.amountCurrency);
} else {
  console.error("\nFAILED:", inv.status, JSON.stringify(inv.json));
}
