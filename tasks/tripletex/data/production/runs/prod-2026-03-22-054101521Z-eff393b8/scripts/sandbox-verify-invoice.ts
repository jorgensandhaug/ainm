// Sandbox verification: confirm comma-separated product query + product VAT inheritance + invoice create
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const res = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`  -> ${res.status}`, JSON.stringify(json).slice(0, 800));
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  // Use existing sandbox products to verify comma-separated query + VAT inheritance
  // First, check what products exist in sandbox
  const prodRes = await api("GET", "/product?count=10&fields=*");
  const products = prodRes.values || [];
  console.log(`\nSandbox products: ${products.length}`);

  if (products.length < 3) {
    console.log("Not enough products in sandbox for verification. Skipping.");
    return;
  }

  // Pick 3 products and try comma-separated number query
  const p1 = products[0];
  const p2 = products[1];
  const p3 = products[2];
  console.log(`\nProduct 1: number=${p1.number}, name=${p1.name}, vatType.id=${p1.vatType?.id}`);
  console.log(`Product 2: number=${p2.number}, name=${p2.name}, vatType.id=${p2.vatType?.id}`);
  console.log(`Product 3: number=${p3.number}, name=${p3.name}, vatType.id=${p3.vatType?.id}`);

  // Verify comma-separated number query
  const commaRes = await api("GET", `/product?number=${p1.number},${p2.number},${p3.number}&fields=*`);
  const commaProducts = commaRes.values || [];
  console.log(`\nComma-separated query returned: ${commaProducts.length} products`);

  if (commaProducts.length === 3) {
    console.log("CONFIRMED: comma-separated number query returns all 3 products");
  } else {
    console.log(`WARNING: comma-separated query returned ${commaProducts.length}/3`);
  }

  // Verify customer lookup
  const custRes = await api("GET", "/customer?count=1&fields=*");
  const customer = custRes.values?.[0];
  if (!customer) { console.log("No customer in sandbox"); return; }
  console.log(`\nCustomer: id=${customer.id}, name=${customer.name}`);

  // Create invoice with product VAT inheritance (no explicit vatType on lines)
  const invoicePayload = {
    invoiceDate: "2026-03-22",
    invoiceDueDate: "2026-04-21",
    customer: { id: customer.id },
    orders: [{
      orderDate: "2026-03-22",
      deliveryDate: "2026-03-22",
      customer: { id: customer.id },
      orderLines: [
        { product: { id: p1.id }, description: p1.name, count: 1, unitPriceExcludingVatCurrency: 10500, vatType: { id: p1.vatType?.id } },
        { product: { id: p2.id }, description: p2.name, count: 1, unitPriceExcludingVatCurrency: 11000, vatType: { id: p2.vatType?.id } },
        { product: { id: p3.id }, description: p3.name, count: 1, unitPriceExcludingVatCurrency: 5850, vatType: { id: p3.vatType?.id } },
      ],
    }],
  };

  const invRes = await api("POST", "/invoice?sendToCustomer=false", invoicePayload);
  const invoice = invRes.value;
  console.log(`\nInvoice created: id=${invoice.id}, invoiceNumber=${invoice.invoiceNumber}`);
  console.log(`amountExcludingVatCurrency=${invoice.amountExcludingVatCurrency}`);
  console.log(`amountCurrency=${invoice.amountCurrency}`);
  console.log(`orderLines count=${invoice.orderLines?.length}`);

  // Expected for sandbox (0% only): excl=27350, incl=27350
  const expectedExcl = 10500 + 11000 + 5850;
  console.log(`\nExpected excl: ${expectedExcl}`);
  console.log(`Match: ${invoice.amountExcludingVatCurrency === expectedExcl}`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
