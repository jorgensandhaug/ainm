const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "w4KV3toEugXz_DDr_gPIcp2CiVSBD123wnd_re9QnNk";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) {
    console.error("ERROR:", JSON.stringify(json, null, 2));
    throw new Error(`${res.status} ${method} ${path}`);
  }
  return json;
}

async function main() {
  // 1. Get customer
  const custResp = await api("GET", "/customer?organizationNumber=800082021&fields=*");
  const customer = custResp.values[0];
  if (!customer) throw new Error("Customer not found");
  console.log(`Customer: ${customer.name} (id=${customer.id})`);

  // 2. Get products
  const prodResp = await api("GET", "/product?number=2797,5684&fields=*,vatType(*)");
  const products = prodResp.values;
  if (products.length < 2) {
    console.log(`Only found ${products.length} products with number filter, falling back to count=1000`);
    const allProd = await api("GET", "/product?count=1000&fields=*,vatType(*)");
    const filtered = allProd.values.filter((p: any) => ["2797", "5684"].includes(String(p.number)));
    if (filtered.length < 2) throw new Error(`Missing products, found: ${filtered.map((p:any) => p.number)}`);
    products.length = 0;
    products.push(...filtered);
  }

  const webdesign = products.find((p: any) => String(p.number) == "2797");
  const analyse = products.find((p: any) => String(p.number) == "5684");
  if (!webdesign || !analyse) throw new Error("Could not match products");
  console.log(`Webdesign: id=${webdesign.id}, vatPct=${webdesign.vatType?.percentage}`);
  console.log(`Analyserapport: id=${analyse.id}, vatPct=${analyse.vatType?.percentage}`);

  // 3. Get payment types
  const ptResp = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
  const paymentType = ptResp.values[0];
  if (!paymentType) throw new Error("No payment type found");
  console.log(`PaymentType: id=${paymentType.id}, desc=${paymentType.description}`);

  // 4. Proactive bank-account hedge
  const bankResp = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
  const invoiceAcct = bankResp.values.find((a: any) => a.isInvoiceAccount === true)
    || bankResp.values.find((a: any) => a.number === 1920)
    || bankResp.values[0];
  if (invoiceAcct && !invoiceAcct.bankAccountNumber) {
    console.log(`Repairing bank account ${invoiceAcct.number} (id=${invoiceAcct.id}) — missing bankAccountNumber`);
    await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
      id: invoiceAcct.id,
      version: invoiceAcct.version,
      number: invoiceAcct.number,
      name: invoiceAcct.name,
      bankAccountNumber: "12345678903",
    });
    console.log("Bank account repaired");
  } else {
    console.log(`Bank account ${invoiceAcct?.number} already has bankAccountNumber`);
  }

  // 5. Compute paidAmount
  const vatPct1 = webdesign.vatType?.percentage ?? 25;
  const vatPct2 = analyse.vatType?.percentage ?? 25;
  const line1Total = 33100 * 1 * (1 + vatPct1 / 100);
  const line2Total = 18550 * 1 * (1 + vatPct2 / 100);
  const paidAmount = line1Total + line2Total;
  console.log(`Line1: 33100 × (1 + ${vatPct1}/100) = ${line1Total}`);
  console.log(`Line2: 18550 × (1 + ${vatPct2}/100) = ${line2Total}`);
  console.log(`paidAmount = ${paidAmount}`);

  // 6. POST /invoice with embedded order
  const invoiceBody = {
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    orders: [
      {
        customer: { id: customer.id },
        orderDate: TODAY,
        deliveryDate: TODAY,
        orderLines: [
          {
            product: { id: webdesign.id },
            description: "Webdesign",
            count: 1,
            unitPriceExcludingVatCurrency: 33100,
          },
          {
            product: { id: analyse.id },
            description: "Analyserapport",
            count: 1,
            unitPriceExcludingVatCurrency: 18550,
          },
        ],
      },
    ],
  };

  const invoiceResp = await api(
    "POST",
    `/invoice?sendToCustomer=false&paymentTypeId=${paymentType.id}&paidAmount=${paidAmount}`,
    invoiceBody
  );

  const inv = invoiceResp.value;
  console.log(`\nInvoice created:`);
  console.log(`  id=${inv.id}, invoiceNumber=${inv.invoiceNumber}`);
  console.log(`  amountOutstanding=${inv.amountOutstanding}`);
  console.log(`  amountCurrencyOutstanding=${inv.amountCurrencyOutstanding}`);
  console.log(`  orderId=${inv.orders?.[0]?.id}`);

  if (inv.amountOutstanding !== 0 && inv.amountCurrencyOutstanding !== 0) {
    console.log("WARNING: Outstanding amount is not zero!");
  } else {
    console.log("Payment fully registered — outstanding is 0");
  }
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
