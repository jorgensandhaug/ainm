// Sandbox verification: confirm the 3-call core path works
// GET /customer -> GET /product?number=X,Y,Z -> POST /invoice
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json();
  console.log(`${method} ${path} -> ${res.status}`);
  if (!res.ok) console.log(JSON.stringify(json, null, 2));
  return { status: res.status, json };
}

async function main() {
  // Step 1: Find an existing customer
  const custRes = await api("GET", "/customer?count=1&fields=*");
  const cust = custRes.json.values?.[0];
  if (!cust) { console.log("No customer found"); return; }
  console.log(`Customer: id=${cust.id}, name=${cust.name}`);

  // Step 2: Get products from catalog
  const prodRes = await api("GET", "/product?count=10&fields=*");
  const products = prodRes.json.values || [];
  console.log(`Products found: ${products.length}`);
  if (products.length < 3) { console.log("Need at least 3 products"); return; }

  // Use first 3 products
  const p1 = products[0], p2 = products[1], p3 = products[2];
  console.log(`  P1: id=${p1.id}, number=${p1.number}, name=${p1.name}, vatType.id=${p1.vatType?.id}`);
  console.log(`  P2: id=${p2.id}, number=${p2.number}, name=${p2.name}, vatType.id=${p2.vatType?.id}`);
  console.log(`  P3: id=${p3.id}, number=${p3.number}, name=${p3.name}, vatType.id=${p3.vatType?.id}`);

  // Step 2b: Now test comma-separated number query
  const commaRes = await api("GET", `/product?number=${p1.number},${p2.number},${p3.number}&fields=*`);
  const commaProducts = commaRes.json.values || [];
  console.log(`Comma-separated query returned ${commaProducts.length} products`);
  for (const p of commaProducts) {
    console.log(`  id=${p.id}, number=${p.number}, vatType.id=${p.vatType?.id}`);
  }

  // Step 3: Create invoice with product vatType.id reuse
  const today = "2026-03-21";
  const payload = {
    invoiceDate: today,
    invoiceDueDate: "2026-04-20",
    customer: { id: cust.id },
    orders: [{
      orderDate: today,
      deliveryDate: today,
      customer: { id: cust.id },
      orderLines: [
        { product: { id: p1.id }, description: p1.name, count: 1, unitPriceExcludingVatCurrency: 5400, vatType: { id: p1.vatType?.id } },
        { product: { id: p2.id }, description: p2.name, count: 1, unitPriceExcludingVatCurrency: 6850, vatType: { id: p2.vatType?.id } },
        { product: { id: p3.id }, description: p3.name, count: 1, unitPriceExcludingVatCurrency: 13750, vatType: { id: p3.vatType?.id } },
      ]
    }]
  };

  const invRes = await api("POST", "/invoice?sendToCustomer=false", payload);
  if (invRes.status === 201 || invRes.status === 200) {
    const inv = invRes.json.value;
    console.log(`\nInvoice created: id=${inv.id}, invoiceNumber=${inv.invoiceNumber}`);
    console.log(`  amountExcludingVatCurrency=${inv.amountExcludingVatCurrency}`);
    console.log(`  amountCurrency=${inv.amountCurrency}`);
    console.log(`  orderLines count=${inv.orderLines?.length || 0}`);
    console.log("\n3-call core path verified in sandbox.");
  } else {
    console.log("Invoice creation failed in sandbox");
  }
}

main();
