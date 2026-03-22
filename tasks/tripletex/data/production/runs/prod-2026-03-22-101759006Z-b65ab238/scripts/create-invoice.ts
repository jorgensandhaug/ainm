const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "wvn_x0r8hhQQSqUm5vH1ZJA3LvCOQSmzCKFnlC2ulIU";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} -> ${r.status}`);
  if (r.status >= 400) { console.log(JSON.stringify(json, null, 2)); }
  return { status: r.status, data: json };
}

async function main() {
  // 1. Resolve customer
  const cust = await api("GET", "/customer?organizationNumber=829487888&fields=*");
  if (cust.status !== 200 || cust.data.count === 0) {
    console.log("Customer not found"); return;
  }
  const customerId = cust.data.values[0].id;
  console.log(`Customer: id=${customerId}, name=${cust.data.values[0].name}`);

  // 2. Resolve products (comma-separated number query, OR semantics)
  const prod = await api("GET", "/product?number=6042,5211,8022&fields=*");
  if (prod.status !== 200) { console.log("Product lookup failed"); return; }

  const products = prod.data.values;
  console.log(`Products found: ${products.length}`);

  const byNumber: Record<string, any> = {};
  for (const p of products) {
    byNumber[String(p.number)] = p;
    console.log(`  Product ${p.number}: id=${p.id}, name=${p.name}, vatType.id=${p.vatType?.id}`);
  }

  // Verify all 3 products resolved
  for (const num of ["6042", "5211", "8022"]) {
    if (!byNumber[num]) { console.log(`Missing product ${num}`); return; }
  }

  const p6042 = byNumber["6042"];
  const p5211 = byNumber["5211"];
  const p8022 = byNumber["8022"];

  // 3. Build invoice payload
  const today = "2026-03-22";
  const due = "2026-04-21";

  const invoicePayload = {
    invoiceDate: today,
    invoiceDueDate: due,
    customer: { id: customerId },
    orders: [
      {
        orderDate: today,
        deliveryDate: today,
        customer: { id: customerId },
        orderLines: [
          {
            description: p6042.name,
            count: 1,
            unitPriceExcludingVatCurrency: 2350,
            product: { id: p6042.id },
            vatType: { id: p6042.vatType.id }
          },
          {
            description: p5211.name,
            count: 1,
            unitPriceExcludingVatCurrency: 3150,
            product: { id: p5211.id },
            vatType: { id: p5211.vatType.id }
          },
          {
            description: p8022.name,
            count: 1,
            unitPriceExcludingVatCurrency: 14300,
            product: { id: p8022.id },
            vatType: { id: p8022.vatType.id }
          }
        ]
      }
    ]
  };

  // 4. Create invoice
  let inv = await api("POST", "/invoice?sendToCustomer=false", invoicePayload);

  // 5. Bank-account repair if needed
  if (inv.status === 422 && JSON.stringify(inv.data).includes("bankkontonummer")) {
    console.log("Bank account missing — repairing...");
    const accts = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
    if (accts.status === 200 && accts.data.count > 0) {
      const acct = accts.data.values[0];
      console.log(`Bank account: id=${acct.id}, number=${acct.number}`);
      const fix = await api("PUT", `/ledger/account/${acct.id}`, {
        ...acct,
        bankAccountNumber: "12345678903"
      });
      console.log(`Bank account fix: ${fix.status}`);
      // Retry invoice
      inv = await api("POST", "/invoice?sendToCustomer=false", invoicePayload);
    }
  }

  if (inv.status === 201) {
    const v = inv.data.value;
    console.log(`\nInvoice created successfully!`);
    console.log(`  id=${v.id}`);
    console.log(`  invoiceNumber=${v.invoiceNumber}`);
    console.log(`  amountExcludingVatCurrency=${v.amountExcludingVatCurrency}`);
    console.log(`  amountCurrency=${v.amountCurrency}`);

    // 6. Verification GET (free)
    const verify = await api("GET", `/invoice/${v.id}?fields=*,customer(id,name,organizationNumber),orderLines(*,product(*)),orders(*,orderLines(*,product(*),vatType(*)))`);
    if (verify.status === 200) {
      const iv = verify.data.value;
      console.log(`\nVerification:`);
      console.log(`  Customer: ${iv.customer?.name} (${iv.customer?.organizationNumber})`);
      console.log(`  amountExcludingVatCurrency=${iv.amountExcludingVatCurrency}`);
      console.log(`  amountCurrency=${iv.amountCurrency}`);
      const lines = iv.orders?.[0]?.orderLines || iv.orderLines || [];
      for (const l of lines) {
        console.log(`  Line: ${l.description}, count=${l.count}, unitPrice=${l.unitPriceExcludingVatCurrency}, product=${l.product?.number}, vatType=${l.vatType?.name || l.vatType?.id}`);
      }
    }
  } else {
    console.log(`Invoice creation failed with status ${inv.status}`);
  }
}

main().catch(e => console.error(e));
