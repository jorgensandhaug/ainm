const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "sO2hluEyc_VuQOJVHf0tt-w9Mks9k0yETkoainEtJ1w";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}${path}`;
  console.log(`GET ${url}`);
  const r = await fetch(url, { headers: H });
  const j = await r.json();
  console.log(`  ${r.status}`, JSON.stringify(j, null, 2));
  if (!r.ok) throw new Error(`GET ${path} failed: ${r.status}`);
  return j;
}

async function post(path: string, body: any) {
  const url = `${BASE}${path}`;
  console.log(`POST ${url}`);
  const r = await fetch(url, { method: "POST", headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  console.log(`  ${r.status}`, JSON.stringify(j, null, 2));
  return { status: r.status, data: j };
}

async function put(path: string, body: any) {
  const url = `${BASE}${path}`;
  console.log(`PUT ${url}`);
  const r = await fetch(url, { method: "PUT", headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  console.log(`  ${r.status}`, JSON.stringify(j, null, 2));
  return { status: r.status, data: j };
}

async function main() {
  // 1. Resolve customer
  const custRes = await get("/customer?organizationNumber=932956233&fields=*");
  const customer = custRes.values[0];
  if (!customer) throw new Error("Customer not found");
  console.log(`Customer: id=${customer.id}, name=${customer.name}`);

  // 2. Resolve products (comma-separated OR semantics)
  const prodRes = await get("/product?number=5566,6035,5199&fields=*");
  const products = prodRes.values;
  console.log(`Products found: ${products.length}`);

  const prodByNumber: Record<string, any> = {};
  for (const p of products) {
    prodByNumber[String(p.number)] = p;
    console.log(`  Product ${p.number}: id=${p.id}, name=${p.name}, vatType.id=${p.vatType?.id}`);
  }

  const p5566 = prodByNumber["5566"];
  const p6035 = prodByNumber["6035"];
  const p5199 = prodByNumber["5199"];
  if (!p5566 || !p6035 || !p5199) throw new Error("Missing products");

  // 3. Proactive bank-account check
  const bankRes = await get("/ledger/account?isBankAccount=true&fields=*");
  const invoiceAcct = bankRes.values.find((a: any) => a.number === 1920 || a.isInvoiceAccount);
  if (invoiceAcct && !invoiceAcct.bankAccountNumber) {
    console.log(`Bank account ${invoiceAcct.id} missing bankAccountNumber, fixing...`);
    await put(`/ledger/account/${invoiceAcct.id}`, { ...invoiceAcct, bankAccountNumber: "12345678903" });
  }

  // 4. Create invoice
  const today = "2026-03-22";
  const invoicePayload = {
    invoiceDate: today,
    invoiceDueDate: today,
    customer: { id: customer.id },
    orders: [
      {
        orderDate: today,
        deliveryDate: today,
        customer: { id: customer.id },
        orderLines: [
          {
            product: { id: p5566.id },
            description: "Analysis Report",
            count: 1,
            unitPriceExcludingVatCurrency: 24650,
            vatType: { id: p5566.vatType.id },
          },
          {
            product: { id: p6035.id },
            description: "Cloud Storage",
            count: 1,
            unitPriceExcludingVatCurrency: 3350,
            vatType: { id: p6035.vatType.id },
          },
          {
            product: { id: p5199.id },
            description: "Training Session",
            count: 1,
            unitPriceExcludingVatCurrency: 13350,
            vatType: { id: p5199.vatType.id },
          },
        ],
      },
    ],
  };

  const invRes = await post("/invoice?sendToCustomer=false", invoicePayload);
  if (invRes.status === 201) {
    console.log(`Invoice created: id=${invRes.data.value.id}, invoiceNumber=${invRes.data.value.invoiceNumber}`);
    console.log(`  amountExcludingVatCurrency=${invRes.data.value.amountExcludingVatCurrency}`);
    console.log(`  amountCurrency=${invRes.data.value.amountCurrency}`);
  } else {
    throw new Error(`Invoice creation failed: ${invRes.status} ${JSON.stringify(invRes.data)}`);
  }

  // 5. Verification GET
  const invId = invRes.data.value.id;
  await get(`/invoice/${invId}?fields=*,customer(id,name,organizationNumber),orderLines(*,product(*),vatType(*)),orders(*,orderLines(*,product(*),vatType(*)))`);

  console.log("DONE");
}

main().catch((e) => { console.error(e); process.exit(1); });
