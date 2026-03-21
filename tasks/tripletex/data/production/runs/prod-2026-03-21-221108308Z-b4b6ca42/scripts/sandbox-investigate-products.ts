// Investigate: can we set product.number on order lines, or do we need pre-created products?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

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
  // First, check if any products exist
  console.log("=== Check existing products ===");
  const prodRes = await api("GET", "/product?fields=*&count=10");

  // Try creating a simple product
  console.log("\n=== Create a test product with number 9796 ===");
  const createProd = await api("POST", "/product", {
    name: "Analysis Report",
    number: 9796,
  });

  if (createProd.ok) {
    const productId = createProd.json.value?.id;
    console.log(`Product created: id=${productId}`);

    // Now let's check: can we use this product on an order line?
    // First need a customer
    console.log("\n=== Find or create a test customer ===");
    const custRes = await api("GET", "/customer?name=Sandbox+Test+Product&fields=*");
    let customerId: number;
    if (custRes.json.values?.length > 0) {
      customerId = custRes.json.values[0].id;
      console.log(`Customer found: id=${customerId}`);
    } else {
      const newCust = await api("POST", "/customer", {
        name: "Sandbox Test Product Invoice",
        organizationNumber: "999887766",
        invoiceSendMethod: "MANUAL",
      });
      customerId = newCust.json.value?.id;
      console.log(`Customer created: id=${customerId}`);
    }

    // Get VAT types
    const vatRes = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
    const vatTypes = vatRes.json.values || [];
    const vat0 = vatTypes.find((v: any) => v.percentage === 0);
    console.log(`VAT 0%: id=${vat0?.id}`);

    // Create invoice with product reference on order line
    console.log("\n=== Create invoice with product reference ===");
    const invRes = await api("POST", "/invoice?sendToCustomer=false", {
      invoiceDate: TODAY,
      invoiceDueDate: "2026-04-20",
      customer: { id: customerId },
      orders: [{
        customer: { id: customerId },
        orderDate: TODAY,
        deliveryDate: TODAY,
        orderLines: [{
          description: "Analysis Report",
          count: 1,
          unitPriceExcludingVatCurrency: 27700,
          vatType: { id: vat0.id },
          product: { id: productId },
        }],
      }],
    });

    if (invRes.ok) {
      const invoiceId = invRes.json.value?.id;
      console.log(`Invoice created: id=${invoiceId}`);

      // Read back to see if product appears on order line
      console.log("\n=== Readback invoice with product details ===");
      const readback = await api("GET", `/invoice/${invoiceId}?fields=*,orders(*,orderLines(*,product(*),vatType(*)))`);
      const orderLines = readback.json.value?.orders?.[0]?.orderLines || readback.json.value?.orderLines || [];
      for (const ol of orderLines) {
        console.log(`  Order line: description="${ol.description}", product=${JSON.stringify(ol.product)}`);
      }
    }
  }

  // Also try: can we reference a product by number (not id) on the order line?
  console.log("\n\n=== Try product reference by number (not id) ===");
  const custRes2 = await api("GET", "/customer?fields=id&count=1");
  const testCustId = custRes2.json.values?.[0]?.id;
  const vatRes2 = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=id,percentage&count=1`);
  const testVatId = vatRes2.json.values?.[0]?.id;

  const invByNumber = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: "2026-04-20",
    customer: { id: testCustId },
    orders: [{
      customer: { id: testCustId },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: "Test By Number",
        count: 1,
        unitPriceExcludingVatCurrency: 100,
        vatType: { id: testVatId },
        product: { number: 9796 },
      }],
    }],
  });
  console.log(`By number result: ${invByNumber.status}`);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
