const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "T0lzz84Yv9xOCouAy8m3Zn2_ORGCigTpo9eP8hCr68A";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  const j = await r.json();
  if (!r.ok) { console.error("GET", path, r.status, JSON.stringify(j)); process.exit(1); }
  return j;
}

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  return { ok: r.ok, status: r.status, data: j };
}

async function put(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) { console.error("PUT", path, r.status, JSON.stringify(j)); process.exit(1); }
  return j;
}

const today = new Date().toISOString().slice(0, 10);

// 1. GET customer
const custRes = await get("/customer?organizationNumber=919172657&fields=*");
const customer = custRes.values[0];
console.log("Customer:", customer.id, customer.name);

// 2. GET products
const prodRes = await get("/product?number=4783,3343,4380&fields=*,vatType(*)");
const products = prodRes.values;
console.log("Products found:", products.length);

const promptLines = [
  { number: "4783", description: "Sessão de formação", price: 24900 },
  { number: "3343", description: "Armazenamento na nuvem", price: 14050 },
  { number: "4380", description: "Serviço de rede", price: 15750 },
];

const orderLines: any[] = [];
let paidAmount = 0;

for (const pl of promptLines) {
  const prod = products.find((p: any) => String(p.number) === pl.number);
  if (!prod) { console.error("Product not found:", pl.number); process.exit(1); }
  console.log(`  Product ${pl.number}: id=${prod.id}, vatPct=${prod.vatType?.percentage}`);
  const vatPct = prod.vatType?.percentage ?? 0;
  paidAmount += pl.price * (1 + vatPct / 100);
  orderLines.push({
    product: { id: prod.id },
    description: pl.description,
    count: 1,
    unitPriceExcludingVatCurrency: pl.price,
  });
}

console.log("paidAmount:", paidAmount);

// 3. GET payment types
const ptRes = await get("/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
const paymentType = ptRes.values[0];
console.log("PaymentType:", paymentType.id, paymentType.description);

// 4. POST invoice (first attempt)
const invoiceBody = {
  invoiceDate: today,
  invoiceDueDate: today,
  orders: [{
    customer: { id: customer.id },
    orderDate: today,
    deliveryDate: today,
    orderLines,
  }],
};

const invoiceUrl = `/invoice?sendToCustomer=false&paymentTypeId=${paymentType.id}&paidAmount=${paidAmount}`;
let invRes = await post(invoiceUrl, invoiceBody);

// Recovery: bank account missing
if (!invRes.ok && invRes.status === 422) {
  const msg = invRes.data?.validationMessages?.[0]?.message || "";
  if (msg.includes("bankkontonummer")) {
    console.log("Bank account missing — fixing...");
    const acctRes = await get("/ledger/account?isBankAccount=true&fields=*");
    const bankAcct = acctRes.values.find((a: any) => !a.bankAccountNumber);
    if (bankAcct) {
      console.log("Updating account:", bankAcct.id, bankAcct.number);
      await put(`/ledger/account/${bankAcct.id}`, {
        ...bankAcct,
        bankAccountNumber: "12345678903",
      });
    }
    // Retry invoice
    invRes = await post(invoiceUrl, invoiceBody);
  }
}

if (!invRes.ok) {
  console.error("POST /invoice failed:", invRes.status, JSON.stringify(invRes.data));
  process.exit(1);
}

const inv = invRes.data.value;
console.log("Invoice created:", inv.id, "number:", inv.invoiceNumber);
console.log("amountOutstanding:", inv.amountOutstanding, "amountCurrencyOutstanding:", inv.amountCurrencyOutstanding);

if (inv.amountOutstanding === 0 && inv.amountCurrencyOutstanding === 0) {
  console.log("FULLY PAID — done");
} else {
  console.log("WARNING: outstanding != 0");
}
