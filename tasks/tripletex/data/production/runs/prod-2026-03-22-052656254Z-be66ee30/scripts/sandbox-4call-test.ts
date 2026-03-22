// Sandbox test: verify 4-call path (no proactive bank-account hedge) works cleanly
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
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
  }
  return { status: res.status, ok: res.ok, data: json };
}

async function main() {
  // First, find a customer and products in the sandbox
  const custResp = await api("GET", "/customer?count=5&fields=*");
  const customer = custResp.data.values?.[0];
  if (!customer) { console.log("No customers in sandbox"); return; }
  console.log(`Customer: ${customer.name} (id=${customer.id})`);

  const prodResp = await api("GET", "/product?count=5&fields=*,vatType(*)");
  const products = prodResp.data.values;
  if (!products || products.length < 2) { console.log("Not enough products"); return; }
  const p1 = products[0];
  const p2 = products[1];
  console.log(`Product 1: ${p1.name} (id=${p1.id}, number=${p1.number}, vatPct=${p1.vatType?.percentage})`);
  console.log(`Product 2: ${p2.name} (id=${p2.id}, number=${p2.number}, vatPct=${p2.vatType?.percentage})`);

  // Get payment type
  const ptResp = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
  const paymentType = ptResp.data.values[0];
  console.log(`PaymentType: id=${paymentType.id}, desc=${paymentType.description}`);

  // Compute paidAmount
  const vatPct1 = p1.vatType?.percentage ?? 25;
  const vatPct2 = p2.vatType?.percentage ?? 25;
  const price1 = 10000;
  const price2 = 5000;
  const paidAmount = price1 * (1 + vatPct1/100) + price2 * (1 + vatPct2/100);
  console.log(`paidAmount = ${paidAmount} (${price1}×${1+vatPct1/100} + ${price2}×${1+vatPct2/100})`);

  // 4-call path: POST /invoice directly (no bank-account hedge)
  const invoiceBody = {
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    orders: [{
      customer: { id: customer.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [
        { product: { id: p1.id }, description: p1.name, count: 1, unitPriceExcludingVatCurrency: price1 },
        { product: { id: p2.id }, description: p2.name, count: 1, unitPriceExcludingVatCurrency: price2 },
      ],
    }],
  };

  const invResp = await api(
    "POST",
    `/invoice?sendToCustomer=false&paymentTypeId=${paymentType.id}&paidAmount=${paidAmount}`,
    invoiceBody
  );

  if (invResp.ok) {
    const inv = invResp.data.value;
    console.log(`\nInvoice created: id=${inv.id}, invoiceNumber=${inv.invoiceNumber}`);
    console.log(`  amountOutstanding=${inv.amountOutstanding}`);
    console.log(`  amountCurrencyOutstanding=${inv.amountCurrencyOutstanding}`);
    console.log(`  orderId=${inv.orders?.[0]?.id}`);
    console.log("\n4-call path SUCCESS — no bank-account hedge needed in this sandbox");
  } else {
    console.log("\n4-call path FAILED — would need inline recovery");
    if (JSON.stringify(invResp.data).includes("bankkontonummer")) {
      console.log("Failure reason: missing bank account number (bankkontonummer)");
      console.log("Recovery would add 3 more calls (GET ledger + PUT ledger + retry POST) = 7 total");
    }
  }
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
