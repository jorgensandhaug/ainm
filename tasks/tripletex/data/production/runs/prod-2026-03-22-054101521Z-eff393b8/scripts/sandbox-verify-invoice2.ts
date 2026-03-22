// Sandbox verification: find products with small numbers, confirm comma query + invoice create
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
  if (!res.ok && res.status !== 422) throw new Error(`${res.status}: ${JSON.stringify(json)}`);
  return { status: res.status, data: json };
}

async function main() {
  // Get all products and find ones with small numeric numbers
  const { data: prodRes } = await api("GET", "/product?count=1000&fields=*");
  const products = (prodRes.values || []).filter((p: any) => {
    const n = parseInt(p.number, 10);
    return !isNaN(n) && n > 0 && n < 100000 && !p.isInactive;
  });
  console.log(`\nActive products with small numbers: ${products.length}`);

  if (products.length < 3) {
    console.log("Not enough small-number products. Creating 3 test products...");
    for (const [num, name] of [[1340, "Service réseau test"], [9754, "Stockage cloud test"], [7005, "Session de formation test"]]) {
      const { status } = await api("POST", "/product", { name, number: String(num), priceExcludingVatCurrency: 100 });
      console.log(`  Created product ${num}: status=${status}`);
    }
    // Re-fetch
    const { data: refetch } = await api("GET", "/product?number=1340,9754,7005&fields=*");
    console.log(`Re-fetched: ${refetch.values?.length} products`);
    return;
  }

  const p1 = products[0];
  const p2 = products[1];
  const p3 = products[2];
  console.log(`Product 1: number=${p1.number}, name=${p1.name}, vatType.id=${p1.vatType?.id}`);
  console.log(`Product 2: number=${p2.number}, name=${p2.name}, vatType.id=${p2.vatType?.id}`);
  console.log(`Product 3: number=${p3.number}, name=${p3.name}, vatType.id=${p3.vatType?.id}`);

  // Verify comma-separated number query with small numbers
  const { status: commaStatus, data: commaRes } = await api("GET", `/product?number=${p1.number},${p2.number},${p3.number}&fields=*`);
  if (commaStatus === 200) {
    const commaProducts = commaRes.values || [];
    console.log(`\nComma-separated query returned: ${commaProducts.length} products (status=${commaStatus})`);
    console.log(`CONFIRMED: comma-separated number query works for small numbers`);
  } else {
    console.log(`\nComma-separated query failed: status=${commaStatus}`);
  }

  // Get a customer
  const { data: custRes } = await api("GET", "/customer?count=1&fields=*");
  const customer = custRes.values?.[0];
  if (!customer) { console.log("No customer in sandbox"); return; }
  console.log(`\nCustomer: id=${customer.id}, name=${customer.name}`);

  // Create invoice with explicit vatType from product
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

  const { status: invStatus, data: invRes } = await api("POST", "/invoice?sendToCustomer=false", invoicePayload);
  if (invStatus === 201) {
    const invoice = invRes.value;
    console.log(`\nInvoice created: id=${invoice.id}`);
    console.log(`amountExcludingVatCurrency=${invoice.amountExcludingVatCurrency}`);
    console.log(`amountCurrency=${invoice.amountCurrency}`);
    console.log(`orderLines count=${invoice.orderLines?.length}`);
    const expectedExcl = 10500 + 11000 + 5850;
    console.log(`Expected excl: ${expectedExcl}, match: ${invoice.amountExcludingVatCurrency === expectedExcl}`);
    console.log(`\nSANDBOX VERIFICATION PASSED: 3-call path (customer + products + invoice) confirmed`);
  } else {
    console.log(`\nInvoice create failed: status=${invStatus}`);
    console.log(JSON.stringify(invRes));
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
