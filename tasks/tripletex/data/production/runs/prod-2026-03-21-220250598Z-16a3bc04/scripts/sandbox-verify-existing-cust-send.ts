// Sandbox verification: existing-customer direct-line create-and-send invoice
// Tests whether the 3-call path works for existing customers with direct lines
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
  if (r.status >= 400) console.log("ERROR:", JSON.stringify(json).slice(0, 500));
  return { status: r.status, data: json };
}

async function main() {
  console.log("=== Test 1: Existing-customer direct-line create-and-send ===");

  // First, create a test customer if needed
  const custSearch = await api("GET", "/customer?organizationNumber=894181273&fields=*");
  let customerId: number;
  if (custSearch.data?.values?.length > 0) {
    customerId = custSearch.data.values[0].id;
    console.log("Customer already exists:", customerId, custSearch.data.values[0].name);
  } else {
    console.log("Customer not found, creating...");
    const custCreate = await api("POST", "/customer", {
      name: "Brightstone Ltd",
      organizationNumber: "894181273",
      invoiceSendMethod: "MANUAL"
    });
    if (custCreate.status !== 201) { console.log("Customer creation failed"); process.exit(1); }
    customerId = custCreate.data.value.id;
    console.log("Customer created:", customerId);
  }

  // Resolve outgoing VAT
  const vatRes = await api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*");
  const vatTypes = vatRes.data.values || [];
  console.log("Available outgoing VAT types:", vatTypes.map((v: any) => `${v.id}(${v.percentage}%)`).join(", "));
  const vat25 = vatTypes.find((v: any) => v.percentage === 25);
  const vatToUse = vat25 || vatTypes[0]; // sandbox only has 0%, production has 25%
  console.log("Using VAT:", vatToUse?.id, `(${vatToUse?.percentage}%)`);

  // Create and send invoice with sendToCustomer=true
  const invoicePayload = {
    invoiceDate: "2026-03-21",
    invoiceDueDate: "2026-04-04",
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      orderDate: "2026-03-21",
      deliveryDate: "2026-03-21",
      orderLines: [{
        description: "Cloud Storage",
        count: 1,
        unitPriceExcludingVatCurrency: 14150,
        vatType: { id: vatToUse.id }
      }]
    }]
  };

  const invRes = await api("POST", "/invoice?sendToCustomer=true", invoicePayload);
  if (invRes.status === 201) {
    const inv = invRes.data.value;
    console.log("Invoice created and sent successfully:");
    console.log("  id:", inv.id);
    console.log("  invoiceNumber:", inv.invoiceNumber);
    console.log("  amountExcludingVatCurrency:", inv.amountExcludingVatCurrency);
    console.log("  amountCurrency:", inv.amountCurrency);
    console.log("  isSent:", inv.isSent);

    // Readback to verify
    const readback = await api("GET", `/invoice/${inv.id}?fields=*,orders(*,orderLines(*,vatType(*))),orderLines(*,vatType(*))`);
    if (readback.status === 200) {
      const rb = readback.data.value;
      console.log("Readback:");
      console.log("  isSent:", rb.isSent);
      console.log("  amountExcludingVatCurrency:", rb.amountExcludingVatCurrency);
      console.log("  amountCurrency:", rb.amountCurrency);
      const lines = rb.orders?.[0]?.orderLines || [];
      lines.forEach((l: any, i: number) => {
        console.log(`  Line ${i}: desc=${l.description}, count=${l.count}, price=${l.unitPriceExcludingVatCurrency}, vatType=${l.vatType?.id}(${l.vatType?.percentage}%)`);
      });
    }
  } else {
    console.log("Invoice creation failed");
  }

  console.log("\n=== Test 2: Can we skip VAT lookup by omitting vatType on direct line? ===");
  const invRes2 = await api("POST", "/invoice?sendToCustomer=true", {
    invoiceDate: "2026-03-21",
    invoiceDueDate: "2026-04-04",
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      orderDate: "2026-03-21",
      deliveryDate: "2026-03-21",
      orderLines: [{
        description: "Cloud Storage No VAT Test",
        count: 1,
        unitPriceExcludingVatCurrency: 14150
        // No vatType - what happens?
      }]
    }]
  });
  if (invRes2.status === 201) {
    const inv2 = invRes2.data.value;
    console.log("Invoice without vatType created:");
    console.log("  amountExcludingVatCurrency:", inv2.amountExcludingVatCurrency);
    console.log("  amountCurrency:", inv2.amountCurrency);
    console.log("  Same amounts?", inv2.amountExcludingVatCurrency === inv2.amountCurrency ? "YES (0% VAT applied)" : "NO (some VAT applied)");
  }

  console.log("\n=== Test 3: sendToCustomer=true vs default behavior ===");
  // Check if omitting sendToCustomer defaults to true or false
  const invRes3 = await api("POST", "/invoice", {
    invoiceDate: "2026-03-21",
    invoiceDueDate: "2026-04-04",
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      orderDate: "2026-03-21",
      deliveryDate: "2026-03-21",
      orderLines: [{
        description: "Cloud Storage Default Send Test",
        count: 1,
        unitPriceExcludingVatCurrency: 100,
        vatType: { id: vatToUse.id }
      }]
    }]
  });
  if (invRes3.status === 201) {
    const inv3 = invRes3.data.value;
    console.log("Invoice without sendToCustomer param:");
    console.log("  isSent:", inv3.isSent);
    // Readback
    const rb3 = await api("GET", `/invoice/${inv3.id}?fields=*`);
    if (rb3.status === 200) {
      console.log("  Readback isSent:", rb3.data.value.isSent);
    }
  }
}

main();
