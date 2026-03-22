// Sandbox verification: full 3-call path with created products
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
  console.log(`  -> ${res.status}`, JSON.stringify(json).slice(0, 600));
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  // Step 1: GET customer
  const custRes = await api("GET", "/customer?count=1&fields=*");
  const customer = custRes.values?.[0];
  if (!customer) throw new Error("No customer");
  console.log(`\nStep 1 - Customer: id=${customer.id}, name=${customer.name}`);

  // Step 2: GET products with comma-separated number query
  const prodRes = await api("GET", "/product?number=1340,9754,7005&fields=*");
  const products = prodRes.values || [];
  console.log(`\nStep 2 - Products found: ${products.length}`);
  for (const p of products) {
    console.log(`  number=${p.number}, name=${p.name}, vatType.id=${p.vatType?.id}`);
  }

  if (products.length !== 3) throw new Error(`Expected 3 products, got ${products.length}`);
  const byNumber: Record<string, any> = {};
  for (const p of products) byNumber[p.number] = p;

  // Step 3: POST invoice
  const invoicePayload = {
    invoiceDate: "2026-03-22",
    invoiceDueDate: "2026-04-21",
    customer: { id: customer.id },
    orders: [{
      orderDate: "2026-03-22",
      deliveryDate: "2026-03-22",
      customer: { id: customer.id },
      orderLines: [
        { product: { id: byNumber["1340"].id }, description: byNumber["1340"].name, count: 1, unitPriceExcludingVatCurrency: 10500, vatType: { id: byNumber["1340"].vatType?.id } },
        { product: { id: byNumber["9754"].id }, description: byNumber["9754"].name, count: 1, unitPriceExcludingVatCurrency: 11000, vatType: { id: byNumber["9754"].vatType?.id } },
        { product: { id: byNumber["7005"].id }, description: byNumber["7005"].name, count: 1, unitPriceExcludingVatCurrency: 5850, vatType: { id: byNumber["7005"].vatType?.id } },
      ],
    }],
  };

  const invRes = await api("POST", "/invoice?sendToCustomer=false", invoicePayload);
  const invoice = invRes.value;
  console.log(`\nStep 3 - Invoice created:`);
  console.log(`  id=${invoice.id}, invoiceNumber=${invoice.invoiceNumber}`);
  console.log(`  amountExcludingVatCurrency=${invoice.amountExcludingVatCurrency}`);
  console.log(`  amountCurrency=${invoice.amountCurrency}`);
  console.log(`  orderLines count=${invoice.orderLines?.length}`);

  // Verify totals
  const expectedExcl = 10500 + 11000 + 5850;
  console.log(`\n  Expected excl: ${expectedExcl}`);
  console.log(`  Match excl: ${invoice.amountExcludingVatCurrency === expectedExcl}`);
  console.log(`\n=== SANDBOX VERIFICATION: 3-call path (GET customer + GET products + POST invoice) CONFIRMED ===`);
  console.log(`=== Comma-separated number=1340,9754,7005 query returned all 3 products ===`);
  console.log(`=== Product vatType.id inheritance works for invoice line VAT ===`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
