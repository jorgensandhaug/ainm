const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`\n>>> ${method} ${url}`);
  const res = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json();
  console.log(`Status: ${res.status}`);
  return { status: res.status, json };
}

// Test 1: Check existing products
console.log("=== TEST 1: List all products ===");
const allProds = await api("GET", "/product?count=100&fields=*");
const products = allProds.json.values || [];
console.log(`Found ${products.length} products`);
for (const p of products) {
  console.log(`  Product #${p.number} (id=${p.id}): ${p.name}, vatType=${JSON.stringify(p.vatType)}`);
}

if (products.length >= 2) {
  const p1 = products[0];
  const p2 = products[1];
  const nums = [p1.number, p2.number];

  // Test 2: productNumber with repeated params (current approach)
  console.log("\n=== TEST 2: productNumber with repeated params ===");
  const t2 = await api("GET", `/product?productNumber=${nums[0]}&productNumber=${nums[1]}&fields=*`);
  console.log(`Returned ${t2.json.values?.length || 0} products`);
  for (const p of (t2.json.values || [])) {
    console.log(`  Product #${p.number} (id=${p.id}): ${p.name}`);
  }

  // Test 3: productNumber with comma-separated (alternative)
  console.log("\n=== TEST 3: productNumber with comma-separated ===");
  const t3 = await api("GET", `/product?productNumber=${nums.join(",")}&fields=*`);
  console.log(`Returned ${t3.json.values?.length || 0} products`);
  for (const p of (t3.json.values || [])) {
    console.log(`  Product #${p.number} (id=${p.id}): ${p.name}`);
  }

  // Test 4: deprecated number param with comma-separated
  console.log("\n=== TEST 4: deprecated 'number' param ===");
  const t4 = await api("GET", `/product?number=${nums.join(",")}&fields=*`);
  console.log(`Returned ${t4.json.values?.length || 0} products`);
  for (const p of (t4.json.values || [])) {
    console.log(`  Product #${p.number} (id=${p.id}): ${p.name}`);
  }
}

// Test 5: Check existing customers
console.log("\n=== TEST 5: List customers ===");
const allCusts = await api("GET", "/customer?count=10&fields=*");
const customers = allCusts.json.values || [];
console.log(`Found ${customers.length} customers`);
for (const c of customers) {
  console.log(`  Customer id=${c.id}: ${c.name} (org=${c.organizationNumber})`);
}

// Test 6: Try creating a test invoice with correct order fields
if (customers.length > 0 && products.length >= 2) {
  const cust = customers[0];
  const prod = products[0];
  const today = "2026-03-21";

  console.log("\n=== TEST 6: Create test invoice with full order fields ===");
  const invoicePayload = {
    invoiceDate: today,
    invoiceDueDate: today,
    customer: { id: cust.id },
    orders: [{
      orderDate: today,
      deliveryDate: today,
      customer: { id: cust.id },
      orderLines: [
        {
          product: { id: prod.id },
          count: 1,
          unitPriceExcludingVatCurrency: 1000,
          ...(prod.vatType?.id ? { vatType: { id: prod.vatType.id } } : {}),
        },
      ],
    }],
  };
  const inv = await api("POST", "/invoice?sendToCustomer=false", invoicePayload);
  console.log("Invoice result:", JSON.stringify(inv.json, null, 2));

  // Test 7: Try without orderDate/deliveryDate/customer on order to see if it fails
  console.log("\n=== TEST 7: Create invoice WITHOUT order-level fields ===");
  const invoicePayload2 = {
    invoiceDate: today,
    invoiceDueDate: today,
    customer: { id: cust.id },
    orders: [{
      orderLines: [
        {
          product: { id: products[1].id },
          count: 1,
          unitPriceExcludingVatCurrency: 2000,
          ...(products[1].vatType?.id ? { vatType: { id: products[1].vatType.id } } : {}),
        },
      ],
    }],
  };
  const inv2 = await api("POST", "/invoice?sendToCustomer=false", invoicePayload2);
  console.log("Invoice result (no order fields):", JSON.stringify(inv2.json, null, 2));
}
