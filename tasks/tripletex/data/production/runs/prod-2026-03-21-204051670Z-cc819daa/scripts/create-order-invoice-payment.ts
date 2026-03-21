const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "ybvBKGrCcjhhqnHnDYDnWOZdzVWKijTgCC_u1eQeyjg";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const TODAY = "2026-03-21";

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} -> ${res.status}`);
  if (!res.ok) {
    console.log("ERROR:", JSON.stringify(json).slice(0, 500));
    return { ok: false, status: res.status, data: json };
  }
  return { ok: true, status: res.status, data: json };
}

async function main() {
  // 1. Resolve customer
  const custRes = await api("GET", "/customer?organizationNumber=911845016&fields=*");
  if (!custRes.ok) { console.log("BLOCKED: customer lookup failed"); return; }
  const customers = custRes.data.values;
  if (!customers || customers.length === 0) { console.log("BLOCKED: customer not found"); return; }
  const customer = customers[0];
  console.log(`Customer: id=${customer.id} name=${customer.name}`);

  // 2. Resolve products
  const prodRes = await api("GET", "/product?number=7865,3949&fields=*");
  if (!prodRes.ok) { console.log("BLOCKED: product lookup failed"); return; }
  const products = prodRes.data.values || [];
  console.log(`Products found: ${products.length}`);

  let skylagring: any = null;
  let dataraadgjeving: any = null;

  for (const p of products) {
    if (String(p.number) === "7865") skylagring = p;
    if (String(p.number) === "3949") dataraadgjeving = p;
  }

  // Fallback if comma-separated didn't return all
  if (!skylagring || !dataraadgjeving) {
    console.log("Comma-separated returned partial, falling back to count=1000");
    const fallback = await api("GET", "/product?count=1000&fields=*");
    if (!fallback.ok) { console.log("BLOCKED: product fallback failed"); return; }
    for (const p of (fallback.data.values || [])) {
      if (String(p.number) === "7865") skylagring = p;
      if (String(p.number) === "3949") dataraadgjeving = p;
    }
  }

  if (!skylagring || !dataraadgjeving) {
    console.log("BLOCKED: could not resolve both products");
    return;
  }
  console.log(`Skylagring: id=${skylagring.id} vatType.id=${skylagring.vatType?.id}`);
  console.log(`Datarådgjeving: id=${dataraadgjeving.id} vatType.id=${dataraadgjeving.vatType?.id}`);

  // 3. Get payment types
  const ptRes = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
  if (!ptRes.ok) { console.log("BLOCKED: paymentType lookup failed"); return; }
  const paymentTypes = ptRes.data.values || [];
  // Find an incoming payment type (for customer payments)
  const incomingPt = paymentTypes.find((pt: any) => pt.isIncoming === true);
  if (!incomingPt) { console.log("BLOCKED: no incoming payment type found"); return; }
  console.log(`Payment type: id=${incomingPt.id} description=${incomingPt.description}`);

  // 4. Create order
  const orderPayload = {
    customer: { id: customer.id },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [
      {
        product: { id: skylagring.id },
        description: "Skylagring",
        count: 1,
        unitPriceExcludingVatCurrency: 38500,
      },
      {
        product: { id: dataraadgjeving.id },
        description: "Datarådgjeving",
        count: 1,
        unitPriceExcludingVatCurrency: 18500,
      },
    ],
  };

  const orderRes = await api("POST", "/order", orderPayload);
  if (!orderRes.ok) { console.log("BLOCKED: order creation failed"); return; }
  const orderId = orderRes.data.value.id;
  console.log(`Order created: id=${orderId}`);

  // 5. Convert order to invoice with full payment
  const invoicePath = `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false&paymentTypeId=${incomingPt.id}&paidAmount=0.01&paymentTypeIdRestAmount=${incomingPt.id}`;
  let invoiceRes = await api("PUT", invoicePath);

  // Bank account repair if needed
  if (!invoiceRes.ok && invoiceRes.status === 422) {
    const errMsg = JSON.stringify(invoiceRes.data);
    if (errMsg.includes("bankkontonummer") || errMsg.includes("bank account")) {
      console.log("Bank account repair needed...");
      const bankRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
      if (!bankRes.ok) { console.log("BLOCKED: bank account lookup failed"); return; }
      const bankAccounts = bankRes.data.values || [];
      const invoiceBank = bankAccounts.find((a: any) => !a.bankAccountNumber || a.bankAccountNumber === "");
      const targetBank = invoiceBank || bankAccounts[0];
      if (!targetBank) { console.log("BLOCKED: no bank account found"); return; }

      await api("PUT", `/ledger/account/${targetBank.id}`, {
        ...targetBank,
        bankAccountNumber: "12345678903",
      });

      // Retry invoice
      invoiceRes = await api("PUT", invoicePath);
    }
  }

  if (!invoiceRes.ok) { console.log("BLOCKED: invoice creation failed"); return; }

  const invoice = invoiceRes.data.value;
  console.log(`Invoice created: id=${invoice.id} number=${invoice.invoiceNumber}`);
  console.log(`amountExcludingVatCurrency=${invoice.amountExcludingVatCurrency}`);
  console.log(`amountCurrency=${invoice.amountCurrency}`);
  console.log(`amountOutstanding=${invoice.amountOutstanding}`);
  console.log(`amountCurrencyOutstanding=${invoice.amountCurrencyOutstanding}`);

  if (invoice.amountCurrencyOutstanding === 0 || invoice.amountOutstanding === 0) {
    console.log("SUCCESS: Full payment registered, outstanding=0");
  } else {
    console.log("WARNING: Outstanding amount is not zero, may need separate payment step");
  }
}

main().catch(e => console.error("FATAL:", e));
