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

// Customer already resolved: id=108319472
const customerId = 108319472;

// Step 1: Broad product catalog + VAT types in parallel
const [prodRes, vatRes] = await Promise.all([
  get("/product?count=1000&fields=*"),
  get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*"),
]);

// Resolve products by name
const products = prodRes.values || [];
const pSoftware = products.find((p: any) => /software\s*licen/i.test(p.name));
const pMaintenance = products.find((p: any) => /maintenance/i.test(p.name));
const pWebDesign = products.find((p: any) => /web\s*design/i.test(p.name));

if (!pSoftware || !pMaintenance || !pWebDesign) {
  console.error("All products:", products.map((p: any) => `${p.number}: ${p.name}`));
  throw new Error(`Missing products: software=${!!pSoftware} maintenance=${!!pMaintenance} webdesign=${!!pWebDesign}`);
}
console.log("Products:", pSoftware.id, pSoftware.name, "|", pMaintenance.id, pMaintenance.name, "|", pWebDesign.id, pWebDesign.name);

// Resolve VAT types: 25%, 15% (food), 0% (exempt)
const vatTypes = vatRes.values || [];
console.log("VAT types:", vatTypes.map((v: any) => `${v.id}:${v.percentage}%:${v.name}`).join(", "));

const vat25 = vatTypes.find((v: any) => v.percentage === 25);
const vat15 = vatTypes.find((v: any) => v.percentage === 15);
const vat0 = vatTypes.find((v: any) => v.percentage === 0);

if (!vat25 || !vat15 || !vat0) {
  throw new Error(`Missing VAT: 25%=${!!vat25} 15%=${!!vat15} 0%=${!!vat0}`);
}

// Step 2: Create invoice
const invoicePayload = {
  invoiceDate: "2026-03-21",
  invoiceDueDate: "2026-04-20",
  customer: { id: customerId },
  orders: [{
    orderDate: "2026-03-21",
    deliveryDate: "2026-03-21",
    customer: { id: customerId },
    orderLines: [
      {
        product: { id: pSoftware.id },
        description: "Software License",
        count: 1,
        unitPriceExcludingVatCurrency: 3650,
        vatType: { id: vat25.id },
      },
      {
        product: { id: pMaintenance.id },
        description: "Maintenance",
        count: 1,
        unitPriceExcludingVatCurrency: 11000,
        vatType: { id: vat15.id },
      },
      {
        product: { id: pWebDesign.id },
        description: "Web Design",
        count: 1,
        unitPriceExcludingVatCurrency: 17700,
        vatType: { id: vat0.id },
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
