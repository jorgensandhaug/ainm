const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "ednfKnO0T1YtUhc7IXWBoCV_K8jx4tl2beYRpTJWTdU";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  const j = await r.json();
  if (!r.ok) throw { status: r.status, body: j, path };
  return j;
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw { status: r.status, body: j, path };
  return j;
}
async function put(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw { status: r.status, body: j, path };
  return j;
}

// Step 1+2: Resolve customer and products in parallel
const [custRes, prodRes] = await Promise.all([
  get("/customer?organizationNumber=970844708&fields=*"),
  get("/product?productNumber=3957&productNumber=8149&productNumber=8092&fields=*"),
]);

const customer = custRes.values?.[0];
if (!customer) throw new Error("Customer not found");
console.log("Customer:", customer.id, customer.name);

const prodMap = new Map<string, any>();
for (const p of prodRes.values || []) prodMap.set(String(p.number), p);
const p3957 = prodMap.get("3957");
const p8149 = prodMap.get("8149");
const p8092 = prodMap.get("8092");
if (!p3957 || !p8149 || !p8092) {
  console.error("Products found:", [...prodMap.keys()]);
  throw new Error("Not all products resolved");
}
console.log("Products:", p3957.id, p3957.name, "|", p8149.id, p8149.name, "|", p8092.id, p8092.name);
console.log("VAT IDs:", p3957.vatType?.id, p8149.vatType?.id, p8092.vatType?.id);

// Step 3: Build and POST invoice
const invoicePayload = {
  invoiceDate: "2026-03-21",
  invoiceDueDate: "2026-04-20",
  customer: { id: customer.id },
  orders: [{
    orderDate: "2026-03-21",
    deliveryDate: "2026-03-21",
    customer: { id: customer.id },
    orderLines: [
      {
        product: { id: p3957.id },
        description: "Software License",
        count: 1,
        unitPriceExcludingVatCurrency: 3650,
        ...(p3957.vatType?.id ? { vatType: { id: p3957.vatType.id } } : {}),
      },
      {
        product: { id: p8149.id },
        description: "Maintenance",
        count: 1,
        unitPriceExcludingVatCurrency: 11000,
        ...(p8149.vatType?.id ? { vatType: { id: p8149.vatType.id } } : {}),
      },
      {
        product: { id: p8092.id },
        description: "Web Design",
        count: 1,
        unitPriceExcludingVatCurrency: 17700,
        ...(p8092.vatType?.id ? { vatType: { id: p8092.vatType.id } } : {}),
      },
    ],
  }],
};

async function createInvoice() {
  try {
    const res = await post("/invoice?sendToCustomer=false", invoicePayload);
    console.log("Invoice created:", JSON.stringify(res.value, null, 2));
    return res;
  } catch (err: any) {
    const errStr = JSON.stringify(err.body || "");
    if ((err.status === 422 || err.status === 400) && /bank/i.test(errStr)) {
      console.log("Bank account error, repairing...");
      const bankRes = await get("/ledger/account?isBankAccount=true&fields=*");
      const acct = bankRes.values?.find((a: any) => a.isInvoiceAccount) || bankRes.values?.[0];
      if (!acct) throw new Error("No bank account found");
      await put(`/ledger/account/${acct.id}`, { ...acct, bankAccountNumber: "12345678903" });
      console.log("Bank account repaired, retrying...");
      const res = await post("/invoice?sendToCustomer=false", invoicePayload);
      console.log("Invoice created (after repair):", JSON.stringify(res.value, null, 2));
      return res;
    }
    console.error("Invoice creation failed:", errStr);
    throw err;
  }
}

await createInvoice();
