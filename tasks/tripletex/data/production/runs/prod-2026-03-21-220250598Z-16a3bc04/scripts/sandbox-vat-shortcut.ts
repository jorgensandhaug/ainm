// Test if we can skip VAT lookup by using vatType percentage directly
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} => ${r.status}`);
  if (r.status >= 400) console.log("ERROR:", JSON.stringify(json).slice(0, 300));
  return { status: r.status, data: json };
}

async function main() {
  const custRes = await api("GET", "/customer?organizationNumber=894181273&fields=*");
  const customerId = custRes.data.values[0].id;

  // Test 1: vatType with percentage field instead of id
  console.log("\n=== Test 1: vatType: { percentage: 0 } ===");
  const r1 = await api("POST", "/invoice?sendToCustomer=true", {
    invoiceDate: "2026-03-21",
    invoiceDueDate: "2026-04-04",
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      orderDate: "2026-03-21",
      deliveryDate: "2026-03-21",
      orderLines: [{
        description: "VAT Percentage Test",
        count: 1,
        unitPriceExcludingVatCurrency: 100,
        vatType: { percentage: 0 }
      }]
    }]
  });
  if (r1.status === 201) {
    console.log("SUCCESS with percentage only");
    console.log("  amountExcludingVatCurrency:", r1.data.value.amountExcludingVatCurrency);
    console.log("  amountCurrency:", r1.data.value.amountCurrency);
  }

  // Test 2: vatType with number field
  console.log("\n=== Test 2: vatType: { number: 6 } ===");
  const r2 = await api("POST", "/invoice?sendToCustomer=true", {
    invoiceDate: "2026-03-21",
    invoiceDueDate: "2026-04-04",
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      orderDate: "2026-03-21",
      deliveryDate: "2026-03-21",
      orderLines: [{
        description: "VAT Number Test",
        count: 1,
        unitPriceExcludingVatCurrency: 100,
        vatType: { number: 6 }
      }]
    }]
  });
  if (r2.status === 201) {
    console.log("SUCCESS with number only");
  }

  // Test 3: vatType with id=3 (known to fail in sandbox)
  console.log("\n=== Test 3: vatType: { id: 3 } (hardcoded 25%) ===");
  const r3 = await api("POST", "/invoice?sendToCustomer=true", {
    invoiceDate: "2026-03-21",
    invoiceDueDate: "2026-04-04",
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      orderDate: "2026-03-21",
      deliveryDate: "2026-03-21",
      orderLines: [{
        description: "VAT Hardcoded 3 Test",
        count: 1,
        unitPriceExcludingVatCurrency: 100,
        vatType: { id: 3 }
      }]
    }]
  });
  if (r3.status === 201) {
    console.log("SUCCESS with hardcoded id=3");
    console.log("  amountCurrency:", r3.data.value.amountCurrency);
  }
}

main();
