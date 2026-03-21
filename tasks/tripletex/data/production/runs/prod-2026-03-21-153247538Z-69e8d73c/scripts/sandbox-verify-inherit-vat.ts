// Verify: does POST /invoice with product.id inherit product's vatType
// when vatType is omitted from the line vs when it's explicitly set?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const RUN_ID = Date.now().toString().slice(-6);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE.replace(/\/+$/, "")}${path}`;
  const opts: RequestInit = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} -> ${res.status}`);
  if (res.status >= 400) console.log("ERROR:", JSON.stringify(json, null, 2));
  return { status: res.status, json };
}

async function main() {
  // Create customer + 1 product for this test
  const custRes = await api("POST", "/customer", {
    name: `VATInherit Test ${RUN_ID}`,
    organizationNumber: `998${RUN_ID}`,
    invoiceSendMethod: "MANUAL",
  });
  const custId = custRes.json?.value?.id;

  const prodRes = await api("POST", "/product", {
    name: "Test Product",
    number: `TP${RUN_ID}`,
    priceExcludingVatCurrency: 1000,
    vatType: { id: 6 },
  });
  const prodId = prodRes.json?.value?.id;
  const prodVatId = prodRes.json?.value?.vatType?.id;
  console.log(`\nSetup: customer=${custId}, product=${prodId}, product.vatType.id=${prodVatId}`);

  // Test A: Invoice with explicit vatType on line
  console.log("\n=== Test A: Explicit vatType on line ===");
  const invA = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: "2026-03-21",
    invoiceDueDate: "2026-04-20",
    customer: { id: custId },
    orders: [{
      customer: { id: custId },
      orderDate: "2026-03-21",
      deliveryDate: "2026-03-21",
      orderLines: [{
        product: { id: prodId },
        description: "Test Product",
        count: 1,
        unitPriceExcludingVatCurrency: 1000,
        vatType: { id: prodVatId },
      }],
    }],
  });
  const invAId = invA.json?.value?.id;
  console.log(`  Created invoice A id=${invAId}`);

  // Test B: Invoice WITHOUT explicit vatType (inherit from product)
  console.log("\n=== Test B: No vatType on line (inherit from product) ===");
  const invB = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: "2026-03-21",
    invoiceDueDate: "2026-04-20",
    customer: { id: custId },
    orders: [{
      customer: { id: custId },
      orderDate: "2026-03-21",
      deliveryDate: "2026-03-21",
      orderLines: [{
        product: { id: prodId },
        description: "Test Product Inherited",
        count: 1,
        unitPriceExcludingVatCurrency: 1000,
      }],
    }],
  });
  const invBId = invB.json?.value?.id;
  console.log(`  Created invoice B id=${invBId}`);

  // Readback both
  if (invAId) {
    const readA = await api("GET", `/invoice/${invAId}?fields=*,orderLines(*,product(*),vatType(*))`);
    const linesA = readA.json?.value?.orderLines || [];
    console.log("\n=== Readback A (explicit vatType) ===");
    for (const l of linesA) {
      console.log(`  desc=${l.description} vatType.id=${l.vatType?.id} vatType.percentage=${l.vatType?.percentage}%`);
    }
  }
  if (invBId) {
    const readB = await api("GET", `/invoice/${invBId}?fields=*,orderLines(*,product(*),vatType(*))`);
    const linesB = readB.json?.value?.orderLines || [];
    console.log("\n=== Readback B (inherited vatType) ===");
    for (const l of linesB) {
      console.log(`  desc=${l.description} vatType.id=${l.vatType?.id} vatType.percentage=${l.vatType?.percentage}%`);
    }
  }
}

main().catch(console.error);
