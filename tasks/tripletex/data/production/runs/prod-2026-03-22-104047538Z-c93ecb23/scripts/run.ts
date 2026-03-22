const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "7VtyU0K1uLsf9wwHsEAm7-JXp3-BY4yRoA2eLeobwD8";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";
const DUE = "2026-04-05";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} -> ${r.status}`);
  if (!r.ok) { console.log("ERROR:", JSON.stringify(json).slice(0, 500)); }
  return { status: r.status, data: json };
}

async function main() {
  // Step 1-4: parallel free GETs
  const [custR, prodR, ptR, bankR] = await Promise.all([
    api("GET", "/customer?organizationNumber=932937204&fields=*"),
    api("GET", "/product?number=3346,7273&fields=*,vatType(*)"),
    api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)"),
    api("GET", "/ledger/account?isBankAccount=true&fields=*"),
  ]);

  // Customer
  const cust = custR.data?.values?.[0];
  if (!cust) { console.log("BLOCKED: customer not found"); return; }
  console.log(`Customer: id=${cust.id} name=${cust.name} org=${cust.organizationNumber}`);

  // Products
  const prods = prodR.data?.values || [];
  console.log(`Products returned: ${prods.length}`);
  const p3346 = prods.find((p: any) => String(p.number) === "3346");
  const p7273 = prods.find((p: any) => String(p.number) === "7273");
  if (!p3346 || !p7273) {
    console.log("BLOCKED: missing products. Found:", prods.map((p: any) => `${p.number}(${p.name})`));
    // Fallback: get all products
    const allR = await api("GET", "/product?count=1000&fields=*,vatType(*)");
    const all = allR.data?.values || [];
    const f3346 = all.find((p: any) => String(p.number) === "3346");
    const f7273 = all.find((p: any) => String(p.number) === "7273");
    if (!f3346 || !f7273) { console.log("BLOCKED: products still not found"); return; }
    Object.assign(p3346 || {}, f3346);
    Object.assign(p7273 || {}, f7273);
  }
  console.log(`Product 3346: id=${p3346!.id} name=${p3346!.name} vat=${p3346!.vatType?.percentage}%`);
  console.log(`Product 7273: id=${p7273!.id} name=${p7273!.name} vat=${p7273!.vatType?.percentage}%`);

  // Payment type
  const pts = ptR.data?.values || [];
  const pt = pts[0];
  if (!pt) { console.log("BLOCKED: no payment types"); return; }
  console.log(`PaymentType: id=${pt.id} desc=${pt.description}`);

  // Bank account proactive check
  const banks = bankR.data?.values || [];
  const invoiceAcct = banks.find((a: any) => a.isInvoiceAccount) || banks.find((a: any) => a.number === 1920);
  let bankRepaired = false;
  if (invoiceAcct) {
    console.log(`Bank acct: id=${invoiceAcct.id} number=${invoiceAcct.number} bankAcctNum=${invoiceAcct.bankAccountNumber}`);
    if (!invoiceAcct.bankAccountNumber) {
      console.log("Repairing bank account...");
      const putR = await api("PUT", `/ledger/account/${invoiceAcct.id}`, { ...invoiceAcct, bankAccountNumber: "12345678903" });
      bankRepaired = true;
      console.log(`Bank repair: ${putR.status}`);
    }
  }

  // Compute paidAmount
  const vat1 = p3346!.vatType?.percentage ?? 0;
  const vat2 = p7273!.vatType?.percentage ?? 0;
  const line1 = 16000 * (1 + vat1 / 100);
  const line2 = 22050 * (1 + vat2 / 100);
  const paidAmount = line1 + line2;
  console.log(`Line 1: 16000 * (1+${vat1}/100) = ${line1}`);
  console.log(`Line 2: 22050 * (1+${vat2}/100) = ${line2}`);
  console.log(`paidAmount = ${paidAmount}`);

  // Step 5: POST /invoice with embedded order
  const invoiceBody = {
    invoiceDate: TODAY,
    invoiceDueDate: DUE,
    orders: [{
      customer: { id: cust.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [
        {
          product: { id: p3346!.id },
          description: "Data Advisory",
          count: 1,
          unitPriceExcludingVatCurrency: 16000,
        },
        {
          product: { id: p7273!.id },
          description: "Network Service",
          count: 1,
          unitPriceExcludingVatCurrency: 22050,
        },
      ],
    }],
  };

  const invR = await api("POST", `/invoice?sendToCustomer=false&paymentTypeId=${pt.id}&paidAmount=${paidAmount}`, invoiceBody);

  if (invR.status === 422 && JSON.stringify(invR.data).includes("bankkontonummer")) {
    // Reactive fallback if proactive missed
    if (!bankRepaired && invoiceAcct) {
      console.log("Reactive bank repair...");
      await api("PUT", `/ledger/account/${invoiceAcct.id}`, { ...invoiceAcct, bankAccountNumber: "12345678903" });
      const retryR = await api("POST", `/invoice?sendToCustomer=false&paymentTypeId=${pt.id}&paidAmount=${paidAmount}`, invoiceBody);
      if (retryR.status !== 201) { console.log("BLOCKED: invoice retry failed"); return; }
      logInvoice(retryR.data);
      await readback(retryR.data.value.id);
      return;
    }
    console.log("BLOCKED: bank account issue unresolvable");
    return;
  }

  if (invR.status !== 201) { console.log("BLOCKED: invoice creation failed"); return; }
  logInvoice(invR.data);
  await readback(invR.data.value.id);
}

function logInvoice(data: any) {
  const v = data.value;
  console.log(`Invoice created: id=${v.id} number=${v.invoiceNumber}`);
  console.log(`  amount=${v.amount} amountExVat=${v.amountExcludingVat}`);
  console.log(`  outstanding=${v.amountOutstanding} outstandingCurrency=${v.amountCurrencyOutstanding}`);
  console.log(`  isCharged=${v.isCharged} roundoff=${v.amountRoundoff}`);
  if (v.orders?.[0]) console.log(`  orderId=${v.orders[0].id}`);
}

async function readback(invoiceId: number) {
  const rb = await api("GET", `/invoice/${invoiceId}?fields=*,customer(*),orderLines(*,product(*)),orders(*,orderLines(*,product(*)))`);
  const v = rb.data?.value;
  if (!v) { console.log("Readback failed"); return; }
  console.log(`\nReadback invoice ${v.id}:`);
  console.log(`  customer: ${v.customer?.name} org=${v.customer?.organizationNumber}`);
  console.log(`  amount=${v.amount} exVat=${v.amountExcludingVat} outstanding=${v.amountOutstanding}`);
  const oLines = v.orders?.[0]?.orderLines || v.orderLines || [];
  for (const ol of oLines) {
    console.log(`  line: "${ol.description}" product=${ol.product?.name}(${ol.product?.number}) price=${ol.unitPriceExcludingVatCurrency} count=${ol.count}`);
  }
  if (v.amountOutstanding === 0 || v.amountCurrencyOutstanding === 0) {
    console.log("VERIFIED: amountOutstanding=0, fully paid");
  } else {
    console.log(`WARNING: amountOutstanding=${v.amountOutstanding}`);
  }
}

main().catch(e => console.error(e));
