// Readback the "by number" invoice to confirm product linking, and test batch product creation
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`\n${method} ${url}`);
  const opts: RequestInit = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`  → ${res.status}`, JSON.stringify(json).slice(0, 2000));
  return { status: res.status, json, ok: res.ok };
}

async function main() {
  // 1. Readback the "by number" invoice (id=2147644252)
  console.log("=== Readback by-number invoice ===");
  const rb = await api("GET", "/invoice/2147644252?fields=*,orders(*,orderLines(*,product(*),vatType(*)))");
  const ol = rb.json.value?.orders?.[0]?.orderLines?.[0];
  console.log(`\nProduct on order line: number="${ol?.product?.number}", name="${ol?.product?.name}", id=${ol?.product?.id}`);

  // 2. Test batch product creation with POST /product/list
  console.log("\n\n=== Test batch product creation ===");
  const batchRes = await api("POST", "/product/list", [
    { name: "Maintenance", number: 2145 },
    { name: "System Development", number: 5995 },
  ]);
  if (batchRes.ok) {
    const products = batchRes.json.values || [];
    for (const p of products) {
      console.log(`  Created: id=${p.id}, number=${p.number}, name=${p.name}`);
    }
  }

  // 3. Now test creating an invoice with 3 product lines using product IDs from batch + single create
  console.log("\n\n=== Test multi-line invoice with products ===");
  // We have: 9796 (id=84421408), 2145 and 5995 from batch
  const prod9796Id = 84421408;
  let prod2145Id: number, prod5995Id: number;
  if (batchRes.ok) {
    const products = batchRes.json.values || [];
    prod2145Id = products.find((p: any) => p.number === "2145")?.id;
    prod5995Id = products.find((p: any) => p.number === "5995")?.id;
  } else {
    console.log("Batch failed, skipping multi-line test");
    return;
  }

  const vatRes = await api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=id,percentage,number");
  const vats = vatRes.json.values || [];
  const vat0 = vats.find((v: any) => v.percentage === 0);

  const custId = 108124240; // existing sandbox customer

  const invRes = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: "2026-03-21",
    invoiceDueDate: "2026-04-20",
    customer: { id: custId },
    orders: [{
      customer: { id: custId },
      orderDate: "2026-03-21",
      deliveryDate: "2026-03-21",
      orderLines: [
        {
          description: "Analysis Report",
          count: 1,
          unitPriceExcludingVatCurrency: 27700,
          vatType: { id: vat0.id },
          product: { id: prod9796Id },
        },
        {
          description: "Maintenance",
          count: 1,
          unitPriceExcludingVatCurrency: 12700,
          vatType: { id: vat0.id },
          product: { id: prod2145Id },
        },
        {
          description: "System Development",
          count: 1,
          unitPriceExcludingVatCurrency: 7050,
          vatType: { id: vat0.id },
          product: { id: prod5995Id },
        },
      ],
    }],
  });

  if (invRes.ok) {
    const invoiceId = invRes.json.value?.id;
    console.log(`\nMulti-line invoice created: id=${invoiceId}`);

    // Readback
    const readback = await api("GET", `/invoice/${invoiceId}?fields=*,orders(*,orderLines(*,product(*)))`);
    const orders = readback.json.value?.orders || [];
    for (const order of orders) {
      for (const line of order.orderLines || []) {
        console.log(`  Line: desc="${line.description}", product.number="${line.product?.number}", product.name="${line.product?.name}"`);
      }
    }
  }

  // 4. Also test: can we create products inline with POST /invoice (auto-create)?
  console.log("\n\n=== Test inline product creation via invoice ===");
  const inlineRes = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: "2026-03-21",
    invoiceDueDate: "2026-04-20",
    customer: { id: custId },
    orders: [{
      customer: { id: custId },
      orderDate: "2026-03-21",
      deliveryDate: "2026-03-21",
      orderLines: [{
        description: "Inline Product Test",
        count: 1,
        unitPriceExcludingVatCurrency: 500,
        vatType: { id: vat0.id },
        product: { name: "Inline Product", number: 99999 },
      }],
    }],
  });
  console.log(`Inline product result: ${inlineRes.status}`);
  if (inlineRes.ok) {
    const invId = inlineRes.json.value?.id;
    const rb2 = await api("GET", `/invoice/${invId}?fields=*,orders(*,orderLines(*,product(*)))`);
    const ol2 = rb2.json.value?.orders?.[0]?.orderLines?.[0];
    console.log(`  Inline product: number="${ol2?.product?.number}", name="${ol2?.product?.name}"`);
  }
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
