const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "ipQPek2JzveonRz2nJiIeym7UIDZE-930uHAT4MMHPo";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (r.status >= 400) {
    console.log(JSON.stringify(json, null, 2));
    return { _status: r.status, _error: json };
  }
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function main() {
  // Step 1-4: parallel reads
  const [customers, products, paymentTypes, bankAccounts] = await Promise.all([
    api("GET", "/customer?organizationNumber=953795493&fields=*"),
    api("GET", "/product?number=6272,7628&fields=*,vatType(*)"),
    api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)"),
    api("GET", "/ledger/account?isBankAccount=true&fields=*"),
  ]);

  // Customer
  const customer = Array.isArray(customers) ? customers[0] : customers;
  if (!customer?.id) { console.log("Customer not found"); return; }
  console.log(`Customer: id=${customer.id} name=${customer.name} org=${customer.organizationNumber}`);

  // Products
  const prods = Array.isArray(products) ? products : [products];
  const p6272 = prods.find((p: any) => String(p.number) === "6272");
  const p7628 = prods.find((p: any) => String(p.number) === "7628");
  if (!p6272 || !p7628) {
    console.log("Products not found, trying fallback");
    // fallback not needed if both found
    return;
  }
  console.log(`Product 6272: id=${p6272.id} name=${p6272.name} vatType=${JSON.stringify(p6272.vatType)}`);
  console.log(`Product 7628: id=${p7628.id} name=${p7628.name} vatType=${JSON.stringify(p7628.vatType)}`);

  // Payment type - pick first available
  const pts = Array.isArray(paymentTypes) ? paymentTypes : [paymentTypes];
  const pt = pts[0];
  if (!pt?.id) { console.log("No payment type found"); return; }
  console.log(`PaymentType: id=${pt.id} desc=${pt.description}`);

  // Bank account hedge
  const accts = Array.isArray(bankAccounts) ? bankAccounts : [bankAccounts];
  const invoiceAcct = accts.find((a: any) => a.isInvoiceAccount === true) || accts.find((a: any) => a.number === 1920) || accts[0];
  if (invoiceAcct && !invoiceAcct.bankAccountNumber) {
    console.log(`Bank account ${invoiceAcct.number} missing bankAccountNumber, repairing...`);
    await api("PUT", `/ledger/account/${invoiceAcct.id}`, { bankAccountNumber: "12345678903" });
  } else {
    console.log(`Bank account OK: ${invoiceAcct?.number} has ${invoiceAcct?.bankAccountNumber}`);
  }

  // Step 5: compute paidAmount
  const vat6272 = p6272.vatType?.percentage ?? 25;
  const vat7628 = p7628.vatType?.percentage ?? 25;
  const line1 = 30600 * (1 + vat6272 / 100);
  const line2 = 2350 * (1 + vat7628 / 100);
  const paidAmount = line1 + line2;
  console.log(`Line1: 30600 * (1+${vat6272}/100) = ${line1}`);
  console.log(`Line2: 2350 * (1+${vat7628}/100) = ${line2}`);
  console.log(`paidAmount = ${paidAmount}`);

  // Step 6: POST /invoice with embedded orders
  const invoiceBody = {
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    orders: [{
      customer: { id: customer.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [
        {
          product: { id: p6272.id },
          description: "Rapport d'analyse",
          count: 1,
          unitPriceExcludingVatCurrency: 30600,
        },
        {
          product: { id: p7628.id },
          description: "Heures de conseil",
          count: 1,
          unitPriceExcludingVatCurrency: 2350,
        },
      ],
    }],
  };

  const invoice = await api("POST", `/invoice?sendToCustomer=false&paymentTypeId=${pt.id}&paidAmount=${paidAmount}`, invoiceBody);
  if (invoice?._status) {
    // Check for bank account error
    const errMsg = JSON.stringify(invoice._error);
    if (errMsg.includes("bankkontonummer")) {
      console.log("Bank account error, repairing...");
      const accts2 = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
      const arr2 = Array.isArray(accts2) ? accts2 : [accts2];
      const ia2 = arr2.find((a: any) => a.isInvoiceAccount === true) || arr2[0];
      if (ia2) {
        await api("PUT", `/ledger/account/${ia2.id}`, { bankAccountNumber: "12345678903" });
        const retry = await api("POST", `/invoice?sendToCustomer=false&paymentTypeId=${pt.id}&paidAmount=${paidAmount}`, invoiceBody);
        console.log("Retry invoice:", JSON.stringify(retry, null, 2));
        if (!retry?._status) {
          console.log(`Invoice created: id=${retry.id} invoiceNumber=${retry.invoiceNumber} amountOutstanding=${retry.amountOutstanding} amountCurrencyOutstanding=${retry.amountCurrencyOutstanding}`);
          // Readback
          const rb = await api("GET", `/invoice/${retry.id}?fields=*,customer(*),orderLines(*,product(*)),orders(*,orderLines(*,product(*)))`);
          console.log("Readback:", JSON.stringify(rb, null, 2));
        }
      }
    }
    return;
  }

  console.log(`Invoice created: id=${invoice.id} invoiceNumber=${invoice.invoiceNumber} amount=${invoice.amount} amountExcludingVat=${invoice.amountExcludingVat} amountOutstanding=${invoice.amountOutstanding} amountCurrencyOutstanding=${invoice.amountCurrencyOutstanding}`);

  // Step 8: readback
  const rb = await api("GET", `/invoice/${invoice.id}?fields=*,customer(*),orderLines(*,product(*)),orders(*,orderLines(*,product(*)))`);
  console.log("Readback:", JSON.stringify(rb, null, 2));
}

main().catch(e => console.error(e));
