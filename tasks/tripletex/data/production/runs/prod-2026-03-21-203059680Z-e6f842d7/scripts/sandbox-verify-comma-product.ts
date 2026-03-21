const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  console.log(`${method} ${path} -> ${r.status}`);
  return { ok: r.ok, status: r.status, json };
}

async function main() {
  // Step 1: Find an existing customer in sandbox
  const custRes = await api("GET", "/customer?count=3&fields=*");
  if (!custRes.ok || !custRes.json.values?.length) {
    console.error("No customers in sandbox");
    return;
  }
  const customer = custRes.json.values[0];
  console.log("Customer:", customer.id, customer.name);

  // Step 2: Get some products to test with
  const prodRes = await api("GET", "/product?count=10&fields=*");
  if (!prodRes.ok || !prodRes.json.values?.length) {
    console.error("No products in sandbox");
    return;
  }
  const products = prodRes.json.values;
  console.log("Available products:", products.map((p: any) => `${p.number}/${p.name}/vatType:${JSON.stringify(p.vatType)}`).join(", "));

  // Step 3: Pick 3 products and test comma-separated query
  if (products.length < 3) {
    console.error("Need at least 3 products");
    return;
  }
  const p1 = products[0], p2 = products[1], p3 = products[2];
  const numbers = `${p1.number},${p2.number},${p3.number}`;
  console.log("\nTesting comma-separated query: number=" + numbers);
  const commaRes = await api("GET", `/product?number=${numbers}&fields=*`);
  console.log("Comma query returned:", commaRes.json.values?.length, "products");
  if (commaRes.ok && commaRes.json.values) {
    for (const p of commaRes.json.values) {
      console.log(`  Product: number=${p.number}, name=${p.name}, vatType.id=${p.vatType?.id}`);
    }
  }

  // Step 4: Create an invoice using the 3-call core path (minus customer lookup since we already have it)
  const today = "2026-03-21";
  const payload = {
    invoiceDate: today,
    invoiceDueDate: "2026-04-04",
    customer: { id: customer.id },
    orders: [
      {
        customer: { id: customer.id },
        orderDate: today,
        deliveryDate: today,
        orderLines: [
          {
            product: { id: p1.id },
            description: "Test line 1",
            count: 1,
            unitPriceExcludingVatCurrency: 22950,
            vatType: { id: p1.vatType.id }
          },
          {
            product: { id: p2.id },
            description: "Test line 2",
            count: 1,
            unitPriceExcludingVatCurrency: 10250,
            vatType: { id: p2.vatType.id }
          },
          {
            product: { id: p3.id },
            description: "Test line 3",
            count: 1,
            unitPriceExcludingVatCurrency: 3150,
            vatType: { id: p3.vatType.id }
          }
        ]
      }
    ]
  };

  console.log("\nCreating invoice...");
  const invRes = await api("POST", "/invoice?sendToCustomer=false", payload);
  if (invRes.ok) {
    const inv = invRes.json.value;
    console.log("Invoice created:");
    console.log("  id:", inv.id);
    console.log("  invoiceNumber:", inv.invoiceNumber);
    console.log("  amountExcludingVatCurrency:", inv.amountExcludingVatCurrency);
    console.log("  amountCurrency:", inv.amountCurrency);
    console.log("  orderLines count:", inv.orderLines?.length);
  } else {
    console.error("Invoice creation failed:", JSON.stringify(invRes.json));
  }
}

main();
