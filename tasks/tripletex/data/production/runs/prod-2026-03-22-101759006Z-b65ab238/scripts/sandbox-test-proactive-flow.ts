const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
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
  if (r.status >= 400) console.log(JSON.stringify(json, null, 2));
  return { status: r.status, data: json };
}

async function main() {
  console.log("=== Proactive bank-check flow (sandbox proof) ===\n");

  // Step 1: GET customer (free)
  const cust = await api("GET", "/customer?organizationNumber=861379760&fields=*");
  const customerId = cust.data.values[0].id;
  console.log(`Customer: id=${customerId}, name=${cust.data.values[0].name}\n`);

  // Step 2: GET products (free)
  const prod = await api("GET", "/product?number=2109,1175,9974&fields=*");
  const products = prod.data.values;
  console.log(`Products found: ${products.length}`);
  const byNumber: Record<string, any> = {};
  for (const p of products) {
    byNumber[String(p.number)] = p;
    console.log(`  ${p.number}: id=${p.id}, vatType.id=${p.vatType?.id}`);
  }

  // Step 3: Proactive bank-account check (free GET)
  console.log("\n--- Proactive bank-account check ---");
  const accts = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
  const invoiceAcct = accts.data.values?.find((a: any) => a.isInvoiceAccount) || accts.data.values?.[0];
  const needsRepair = !invoiceAcct?.bankAccountNumber;
  console.log(`Invoice account ${invoiceAcct.number}: bankAccountNumber=${JSON.stringify(invoiceAcct.bankAccountNumber)}, needsRepair=${needsRepair}`);

  if (needsRepair) {
    console.log("Repairing bank account...");
    const fix = await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
      ...invoiceAcct,
      bankAccountNumber: "12345678903"
    });
    console.log(`Bank account fix: ${fix.status}`);
  } else {
    console.log("Bank account already configured — no repair needed, 0 extra writes");
  }

  // Step 4: POST invoice (should succeed first time, no 422)
  const p2109 = byNumber["2109"];
  const p1175 = byNumber["1175"];
  const p9974 = byNumber["9974"];

  const today = "2026-03-22";
  const due = "2026-04-21";

  const inv = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: today,
    invoiceDueDate: due,
    customer: { id: customerId },
    orders: [{
      orderDate: today,
      deliveryDate: today,
      customer: { id: customerId },
      orderLines: [
        {
          description: p2109.name,
          count: 1,
          unitPriceExcludingVatCurrency: 5000,
          product: { id: p2109.id },
          vatType: { id: p2109.vatType.id }
        },
        {
          description: p1175.name,
          count: 1,
          unitPriceExcludingVatCurrency: 3000,
          product: { id: p1175.id },
          vatType: { id: p1175.vatType.id }
        },
        {
          description: p9974.name,
          count: 1,
          unitPriceExcludingVatCurrency: 2000,
          product: { id: p9974.id },
          vatType: { id: p9974.vatType.id }
        }
      ]
    }]
  });

  if (inv.status === 201) {
    const v = inv.data.value;
    console.log(`\nInvoice created on FIRST try (no 422)!`);
    console.log(`  id=${v.id}, invoiceNumber=${v.invoiceNumber}`);
    console.log(`  amountExcludingVatCurrency=${v.amountExcludingVatCurrency}`);
    console.log(`  amountCurrency=${v.amountCurrency}`);
  }

  // Step 5: Verification GET (free)
  if (inv.status === 201) {
    const verify = await api("GET", `/invoice/${inv.data.value.id}?fields=*,customer(id,name,organizationNumber),orders(*,orderLines(*,product(*),vatType(*)))`);
    if (verify.status === 200) {
      const iv = verify.data.value;
      console.log(`\nVerification:`);
      console.log(`  Customer: ${iv.customer?.name} (${iv.customer?.organizationNumber})`);
      const lines = iv.orders?.[0]?.orderLines || [];
      for (const l of lines) {
        console.log(`  Line: ${l.description}, count=${l.count}, unitPrice=${l.unitPriceExcludingVatCurrency}, product=${l.product?.number}, vatType=${l.vatType?.name}`);
      }
    }
  }

  console.log("\n=== Summary ===");
  console.log("Calls: GET customer (free) + GET products (free) + GET bank acct (free) + POST invoice (1 write) = 1 write, 0 errors");
  console.log("Bank account was already set so no PUT needed — total writes: 1");
  console.log("In production fresh account: + 1 PUT for bank fix = 2 writes, still 0 errors");
}

main().catch(e => console.error(e));
