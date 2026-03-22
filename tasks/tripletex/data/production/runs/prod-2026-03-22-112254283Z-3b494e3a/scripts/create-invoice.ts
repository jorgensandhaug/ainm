const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "YCKczdWtz-GKdiuWT6Vpo3AcRhOJvSYm0QQwh94u7L0";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(BASE + path, { headers: H });
  if (!r.ok) { const t = await r.text(); throw new Error(`GET ${path} ${r.status}: ${t}`); }
  return r.json();
}
async function put(path: string, body: any) {
  const r = await fetch(BASE + path, { method: "PUT", headers: H, body: JSON.stringify(body) });
  if (!r.ok) { const t = await r.text(); throw new Error(`PUT ${path} ${r.status}: ${t}`); }
  return r.json();
}
async function post(path: string, body: any) {
  const r = await fetch(BASE + path, { method: "POST", headers: H, body: JSON.stringify(body) });
  const t = await r.text();
  console.log(`POST ${path} ${r.status}: ${t}`);
  if (!r.ok) throw new Error(`POST ${path} ${r.status}: ${t}`);
  return JSON.parse(t);
}

async function main() {
  // 1. Resolve customer
  const custResp = await get("/customer?organizationNumber=935438500&fields=*");
  const cust = custResp.values?.[0];
  if (!cust) throw new Error("Customer not found");
  console.log(`Customer: id=${cust.id} name=${cust.name}`);

  // 2. Resolve products (comma-separated OR semantics)
  const prodResp = await get("/product?number=8679,5934,8942&fields=*");
  const prods = prodResp.values;
  if (!prods || prods.length < 3) throw new Error(`Expected 3 products, got ${prods?.length}`);
  const byNum: Record<string, any> = {};
  for (const p of prods) { byNum[String(p.number)] = p; console.log(`Product: number=${p.number} name=${p.name} vatType.id=${p.vatType?.id}`); }

  const p8679 = byNum["8679"]; // Stockage cloud, 25%
  const p5934 = byNum["5934"]; // Développement système, 15%
  const p8942 = byNum["8942"]; // Session de formation, 0%
  if (!p8679 || !p5934 || !p8942) throw new Error("Missing product by number");

  // 3. Proactive bank-account check (GET is free)
  const bankResp = await get("/ledger/account?isBankAccount=true&fields=*");
  const invoiceAcct = bankResp.values?.find((a: any) => a.number === 1920 || a.isInvoiceAccount);
  if (invoiceAcct && !invoiceAcct.bankAccountNumber) {
    console.log(`Bank account ${invoiceAcct.id} missing bankAccountNumber, fixing...`);
    await put(`/ledger/account/${invoiceAcct.id}`, { ...invoiceAcct, bankAccountNumber: "12345678903" });
    console.log("Bank account fixed.");
  }

  // 4. Create invoice
  const today = new Date().toISOString().slice(0, 10);
  const dueDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const invoice = await post("/invoice?sendToCustomer=false", {
    invoiceDate: today,
    invoiceDueDate: dueDate,
    customer: { id: cust.id },
    orders: [
      {
        orderDate: today,
        deliveryDate: today,
        customer: { id: cust.id },
        orderLines: [
          {
            product: { id: p8679.id },
            description: p8679.name,
            count: 1,
            unitPriceExcludingVatCurrency: 13200,
            vatType: { id: p8679.vatType.id }
          },
          {
            product: { id: p5934.id },
            description: p5934.name,
            count: 1,
            unitPriceExcludingVatCurrency: 1900,
            vatType: { id: p5934.vatType.id }
          },
          {
            product: { id: p8942.id },
            description: p8942.name,
            count: 1,
            unitPriceExcludingVatCurrency: 14800,
            vatType: { id: p8942.vatType.id }
          }
        ]
      }
    ]
  });

  const inv = invoice.value;
  console.log(`Invoice created: id=${inv.id} invoiceNumber=${inv.invoiceNumber}`);
  console.log(`amountExcludingVatCurrency=${inv.amountExcludingVatCurrency} amountCurrency=${inv.amountCurrency}`);

  // 5. Verify (GETs are free)
  const verify = await get(`/invoice/${inv.id}?fields=*,customer(id,name,organizationNumber),orderLines(*,product(*)),orders(*,orderLines(*,product(*),vatType(*)))`);
  const v = verify.value;
  console.log(`\nVerification:`);
  console.log(`  invoiceNumber=${v.invoiceNumber}`);
  console.log(`  amountExcludingVatCurrency=${v.amountExcludingVatCurrency}`);
  console.log(`  amountCurrency=${v.amountCurrency}`);
  console.log(`  customer: ${v.customer?.name} (${v.customer?.organizationNumber})`);
  for (const order of v.orders || []) {
    for (const line of order.orderLines || []) {
      console.log(`  line: product=${line.product?.number} desc="${line.description}" count=${line.count} unitPrice=${line.unitPriceExcludingVatCurrency} vatType=${line.vatType?.id}/${line.vatType?.percentage}%`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
