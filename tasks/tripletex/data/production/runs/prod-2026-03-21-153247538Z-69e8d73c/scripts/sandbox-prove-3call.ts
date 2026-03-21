// Sandbox proof: verify the 3-call create-customer-invoice path
// 1. Create analog customer + products for proof
// 2. Then prove the 3-call path: GET customer -> GET product -> POST invoice

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
  if (res.status >= 400) {
    console.log("ERROR:", JSON.stringify(json, null, 2));
  }
  return { status: res.status, json };
}

async function main() {
  // === SETUP: Create analog customer and products ===
  console.log("=== SETUP: Create analog customer ===");
  const custCreate = await api("POST", "/customer", {
    name: `Ridgepoint Sandbox ${RUN_ID} Ltd`,
    organizationNumber: `999${RUN_ID}`,
    invoiceSendMethod: "MANUAL",
  });
  const customerId = custCreate.json?.value?.id;
  console.log(`  Created customer id=${customerId}`);

  console.log("\n=== SETUP: Create 3 analog products ===");
  const p1 = await api("POST", "/product", {
    name: "Software License",
    number: `SL${RUN_ID}`,
    priceExcludingVatCurrency: 3650,
    vatType: { id: 6 }, // only 0% available in sandbox
  });
  const p2 = await api("POST", "/product", {
    name: "Maintenance",
    number: `MT${RUN_ID}`,
    priceExcludingVatCurrency: 11000,
    vatType: { id: 6 },
  });
  const p3 = await api("POST", "/product", {
    name: "Web Design",
    number: `WD${RUN_ID}`,
    priceExcludingVatCurrency: 17700,
    vatType: { id: 6 },
  });
  const prod1Id = p1.json?.value?.id;
  const prod2Id = p2.json?.value?.id;
  const prod3Id = p3.json?.value?.id;
  console.log(`  Created products: ${prod1Id}, ${prod2Id}, ${prod3Id}`);

  // === PROOF: 3-call path ===
  console.log("\n=== PROOF: 3-call path starts here ===");

  // Call 1: GET customer
  console.log("\n--- Call 1: GET /customer ---");
  const custGet = await api("GET", `/customer?organizationNumber=999${RUN_ID}&fields=*`);
  const resolvedCustId = custGet.json?.values?.[0]?.id;
  console.log(`  Resolved customer id=${resolvedCustId}`);

  // Call 2: GET products by productNumber
  console.log("\n--- Call 2: GET /product ---");
  const prodGet = await api("GET", `/product?productNumber=SL${RUN_ID}&productNumber=MT${RUN_ID}&productNumber=WD${RUN_ID}&fields=*`);
  const products = prodGet.json?.values || [];
  console.log(`  Resolved ${products.length} products:`);
  for (const p of products) {
    console.log(`    id=${p.id} number=${p.number} name=${p.name} vatType=${JSON.stringify(p.vatType)}`);
  }

  // Map products by name for correct assignment
  const prodMap: Record<string, any> = {};
  for (const p of products) prodMap[p.name] = p;

  // Call 3: POST invoice
  console.log("\n--- Call 3: POST /invoice ---");
  const today = "2026-03-21";
  const dueDate = "2026-04-20";
  const invoiceRes = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: today,
    invoiceDueDate: dueDate,
    customer: { id: resolvedCustId },
    orders: [{
      customer: { id: resolvedCustId },
      orderDate: today,
      deliveryDate: today,
      orderLines: [
        {
          product: { id: prodMap["Software License"]?.id },
          description: "Software License",
          count: 1,
          unitPriceExcludingVatCurrency: 3650,
          vatType: { id: prodMap["Software License"]?.vatType?.id },
        },
        {
          product: { id: prodMap["Maintenance"]?.id },
          description: "Maintenance",
          count: 1,
          unitPriceExcludingVatCurrency: 11000,
          vatType: { id: prodMap["Maintenance"]?.vatType?.id },
        },
        {
          product: { id: prodMap["Web Design"]?.id },
          description: "Web Design",
          count: 1,
          unitPriceExcludingVatCurrency: 17700,
          vatType: { id: prodMap["Web Design"]?.vatType?.id },
        },
      ],
    }],
  });

  if (invoiceRes.status === 201 || invoiceRes.status === 200) {
    const inv = invoiceRes.json?.value;
    console.log(`  SUCCESS! Invoice id=${inv?.id} invoiceNumber=${inv?.invoiceNumber}`);
    console.log(`  amountExcludingVatCurrency=${inv?.amountExcludingVatCurrency}`);
    console.log(`  amountCurrency=${inv?.amountCurrency}`);
    console.log(`  orderLines count=${inv?.orderLines?.length}`);

    // Verify readback to prove product linking
    console.log("\n=== VERIFICATION: GET /invoice for product linking ===");
    const readback = await api("GET", `/invoice/${inv.id}?fields=*,orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))`);
    const readInv = readback.json?.value;
    if (readInv?.orderLines) {
      for (const ol of readInv.orderLines) {
        console.log(`  line: product.number=${ol.product?.number} desc=${ol.description} price=${ol.unitPriceExcludingVatCurrency} vat=${ol.vatType?.percentage}%`);
      }
    }
  } else {
    console.log(`  FAILED with status ${invoiceRes.status}`);
    console.log(`  Response: ${JSON.stringify(invoiceRes.json, null, 2)}`);

    // Check if bank account issue
    const msg = JSON.stringify(invoiceRes.json);
    if (msg.includes("bankkontonummer")) {
      console.log("\n=== BANK ACCOUNT REPAIR ===");
      const bankRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
      if (bankRes.json?.values) {
        const invoiceAcct = bankRes.json.values.find((a: any) => a.isInvoiceAccount) || bankRes.json.values[0];
        console.log(`  Found invoice account id=${invoiceAcct.id} number=${invoiceAcct.number} bankAccountNumber=${invoiceAcct.bankAccountNumber}`);
        if (!invoiceAcct.bankAccountNumber) {
          const putRes = await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
            id: invoiceAcct.id,
            version: invoiceAcct.version,
            number: invoiceAcct.number,
            name: invoiceAcct.name,
            bankAccountNumber: "12345678903",
          });
          console.log(`  Updated bank account: ${putRes.status}`);
        }
      }
      // Retry invoice
      console.log("\n=== RETRY: POST /invoice ===");
      const retryRes = await api("POST", "/invoice?sendToCustomer=false", {
        invoiceDate: today,
        invoiceDueDate: dueDate,
        customer: { id: resolvedCustId },
        orders: [{
          customer: { id: resolvedCustId },
          orderDate: today,
          deliveryDate: today,
          orderLines: [
            {
              product: { id: prodMap["Software License"]?.id },
              description: "Software License",
              count: 1,
              unitPriceExcludingVatCurrency: 3650,
              vatType: { id: prodMap["Software License"]?.vatType?.id },
            },
            {
              product: { id: prodMap["Maintenance"]?.id },
              description: "Maintenance",
              count: 1,
              unitPriceExcludingVatCurrency: 11000,
              vatType: { id: prodMap["Maintenance"]?.vatType?.id },
            },
            {
              product: { id: prodMap["Web Design"]?.id },
              description: "Web Design",
              count: 1,
              unitPriceExcludingVatCurrency: 17700,
              vatType: { id: prodMap["Web Design"]?.vatType?.id },
            },
          ],
        }],
      });
      const retryInv = retryRes.json?.value;
      console.log(`  Retry result: id=${retryInv?.id} amountExcluding=${retryInv?.amountExcludingVatCurrency} amountCurrency=${retryInv?.amountCurrency}`);
    }
  }
}

main().catch(console.error);
