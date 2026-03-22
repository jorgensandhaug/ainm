const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "VBuSsqD-LQfOyefzt5gimeFdCLleEFKDotO3b0V0nxs";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (r.status >= 400) { console.log(JSON.stringify(json, null, 2)); throw new Error(`${r.status} ${method} ${path}`); }
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function main() {
  const today = "2026-03-22";

  // Step 1-4: parallel free GETs
  const [customers, products, paymentTypes, bankAccounts] = await Promise.all([
    api("GET", `/customer?organizationNumber=970769994&fields=*`),
    api("GET", `/product?number=3237,4609&fields=*,vatType(*)`),
    api("GET", `/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`),
    api("GET", `/ledger/account?isBankAccount=true&fields=*`),
  ]);

  // Customer
  const customer = customers[0];
  console.log("Customer:", customer.id, customer.name, customer.organizationNumber);

  // Products
  console.log("Products found:", products.length);
  const p3237 = products.find((p: any) => String(p.number) === "3237");
  const p4609 = products.find((p: any) => String(p.number) === "4609");
  if (!p3237 || !p4609) {
    console.log("Missing product, trying broad fetch...");
    const all = await api("GET", `/product?count=1000&fields=*,vatType(*)`);
    if (!p3237) { const f = all.find((p: any) => String(p.number) === "3237"); if (f) Object.assign(p3237 || {}, f); }
    if (!p4609) { const f = all.find((p: any) => String(p.number) === "4609"); if (f) Object.assign(p4609 || {}, f); }
  }
  console.log("P3237:", p3237.id, p3237.name, "VAT:", p3237.vatType?.percentage);
  console.log("P4609:", p4609.id, p4609.name, "VAT:", p4609.vatType?.percentage);

  // Payment type - just use first available
  const pt = paymentTypes[0];
  console.log("PaymentType:", pt.id, pt.description);

  // Bank account hedge
  const invoiceAcct = bankAccounts.find((a: any) => a.isInvoiceAccount);
  if (invoiceAcct && !invoiceAcct.bankAccountNumber) {
    console.log("Bank account missing, repairing...");
    await api("PUT", `/ledger/account/${invoiceAcct.id}`, { bankAccountNumber: "12345678903" });
    console.log("Bank account repaired");
  } else {
    console.log("Bank account OK:", invoiceAcct?.number, invoiceAcct?.bankAccountNumber);
  }

  // Compute paidAmount
  const vat3237 = p3237.vatType?.percentage ?? 25;
  const vat4609 = p4609.vatType?.percentage ?? 25;
  const line1 = 13450 * (1 + vat3237 / 100);
  const line2 = 14200 * (1 + vat4609 / 100);
  const paidAmount = line1 + line2;
  console.log(`Line1: 13450 * (1+${vat3237}/100) = ${line1}`);
  console.log(`Line2: 14200 * (1+${vat4609}/100) = ${line2}`);
  console.log(`paidAmount: ${paidAmount}`);

  // Step 5: POST /invoice with embedded orders + payment
  const invoice = await api("POST", `/invoice?sendToCustomer=false&paymentTypeId=${pt.id}&paidAmount=${paidAmount}`, {
    invoiceDate: today,
    invoiceDueDate: today,
    orders: [{
      customer: { id: customer.id },
      orderDate: today,
      deliveryDate: today,
      orderLines: [
        {
          product: { id: p3237.id },
          description: "Nettverksteneste",
          count: 1,
          unitPriceExcludingVatCurrency: 13450,
        },
        {
          product: { id: p4609.id },
          description: "Analyserapport",
          count: 1,
          unitPriceExcludingVatCurrency: 14200,
        },
      ],
    }],
  });

  console.log("Invoice created:", invoice.id, "invoiceNumber:", invoice.invoiceNumber);
  console.log("amountOutstanding:", invoice.amountOutstanding, "amountCurrencyOutstanding:", invoice.amountCurrencyOutstanding);
  console.log(JSON.stringify(invoice, null, 2));

  // Step 6: Readback verification
  const readback = await api("GET", `/invoice/${invoice.id}?fields=*,customer(*),orderLines(*,product(*)),orders(*,orderLines(*,product(*)))`);
  console.log("=== READBACK ===");
  console.log(JSON.stringify(readback, null, 2));
  console.log("amountOutstanding:", readback.amountOutstanding, "amountCurrencyOutstanding:", readback.amountCurrencyOutstanding);
}

main().catch(e => { console.error(e); process.exit(1); });
