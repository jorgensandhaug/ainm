const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(BASE + path, { headers: H });
  const t = await r.text();
  console.log(`GET ${path} ${r.status}`);
  if (!r.ok) throw new Error(`GET ${path} ${r.status}: ${t}`);
  return JSON.parse(t);
}

async function post(path: string, body: any) {
  const r = await fetch(BASE + path, { method: "POST", headers: H, body: JSON.stringify(body) });
  const t = await r.text();
  console.log(`POST ${path} ${r.status}`);
  if (!r.ok) throw new Error(`POST ${path} ${r.status}: ${t}`);
  return JSON.parse(t);
}

async function main() {
  // Verify comma-separated product query with products known to exist in sandbox
  const prodResp = await get("/product?number=2109,1175,9974&fields=*");
  console.log(`Products found: ${prodResp.count}`);
  for (const p of prodResp.values || []) {
    console.log(`  number=${p.number} name=${p.name} vatType.id=${p.vatType?.id}`);
  }

  // Verify bank-account proactive check
  const bankResp = await get("/ledger/account?isBankAccount=true&fields=*");
  const invoiceAcct = bankResp.values?.find((a: any) => a.number === 1920 || a.isInvoiceAccount);
  console.log(`Bank account: id=${invoiceAcct?.id} number=${invoiceAcct?.number} bankAccountNumber=${invoiceAcct?.bankAccountNumber}`);

  // If bank account already has number, create a test invoice without needing PUT
  // This confirms the 5-call path (no bank repair needed)
  const custResp = await get("/customer?organizationNumber=861379760&fields=*");
  const cust = custResp.values?.[0];
  if (!cust) { console.log("No test customer in sandbox, skipping invoice test"); return; }
  console.log(`Customer: id=${cust.id} name=${cust.name}`);

  const prods = prodResp.values;
  if (!prods || prods.length < 3) { console.log("Not enough products for invoice test"); return; }

  const today = "2026-03-22";
  const inv = await post("/invoice?sendToCustomer=false", {
    invoiceDate: today,
    invoiceDueDate: "2026-04-21",
    customer: { id: cust.id },
    orders: [{
      orderDate: today, deliveryDate: today,
      customer: { id: cust.id },
      orderLines: [
        { product: { id: prods[0].id }, description: prods[0].name, count: 1, unitPriceExcludingVatCurrency: 13200, vatType: { id: prods[0].vatType.id } },
        { product: { id: prods[1].id }, description: prods[1].name, count: 1, unitPriceExcludingVatCurrency: 1900, vatType: { id: prods[1].vatType.id } },
        { product: { id: prods[2].id }, description: prods[2].name, count: 1, unitPriceExcludingVatCurrency: 14800, vatType: { id: prods[2].vatType.id } }
      ]
    }]
  });

  const v = inv.value;
  console.log(`\nSandbox invoice: id=${v.id} amountExcludingVatCurrency=${v.amountExcludingVatCurrency} amountCurrency=${v.amountCurrency}`);

  // Verify readback
  const readback = await get(`/invoice/${v.id}?fields=*,orders(*,orderLines(*,product(*),vatType(*)))`);
  const rb = readback.value;
  console.log(`Readback: amountExcludingVatCurrency=${rb.amountExcludingVatCurrency} amountCurrency=${rb.amountCurrency}`);
  for (const order of rb.orders || []) {
    for (const line of order.orderLines || []) {
      console.log(`  line: product=${line.product?.number} unitPrice=${line.unitPriceExcludingVatCurrency} vatType=${line.vatType?.id}/${line.vatType?.percentage}%`);
    }
  }

  console.log(`\nSandbox verification complete. Flow confirmed.`);
}

main().catch(e => { console.error(e); process.exit(1); });
