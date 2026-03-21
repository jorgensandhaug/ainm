// Verify: does product: { number } on POST /order link to the EXISTING product?
// And can we invoice it?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const j = await r.json();
  console.log(method, path.substring(0,100), "→", r.status);
  if (!r.ok) console.log("  Error:", JSON.stringify(j).substring(0, 500));
  return { ok: r.ok, status: r.status, data: j };
}

async function main() {
  // Get the sandbox customer (by id) and product
  const custR = await api("GET", "/customer?count=1&fields=*");
  const cust = custR.data.values[0];
  console.log("Customer:", cust.id, cust.name);

  const prodR = await api("GET", "/product?count=2&fields=*");
  const prods = prodR.data.values;
  const prod = prods[0];
  console.log("Product:", prod.id, prod.number, prod.name);

  const today = new Date().toISOString().slice(0, 10);

  // Create order with product by number
  console.log("\n--- Creating order with product: { number } ---");
  const orderR = await api("POST", "/order", {
    customer: { id: cust.id },
    orderDate: today,
    deliveryDate: today,
    orderLines: [
      { product: { number: String(prod.number) }, description: "Test product by number", count: 1, unitPriceExcludingVatCurrency: 500 }
    ]
  });
  if (!orderR.ok) return;
  const orderId = orderR.data.value.id;
  console.log("Order created:", orderId);

  // Read back the order to verify product linkage
  const readR = await api("GET", `/order/${orderId}?fields=*,orderLines(*,product(*))`);
  if (readR.ok) {
    const lines = readR.data.value.orderLines;
    console.log("\nOrder lines:");
    for (const l of lines) {
      console.log(`  Product id=${l.product?.id} number=${l.product?.number} name=${l.product?.name}`);
      console.log(`  Description: ${l.description}, price: ${l.unitPriceExcludingVatCurrency}`);
    }
    // Verify it's the same product
    if (lines.length > 0 && lines[0].product?.id === prod.id) {
      console.log("\n✓ Product correctly linked to existing product ID", prod.id);
    } else {
      console.log("\n✗ Product mismatch! Expected", prod.id, "got", lines[0]?.product?.id);
    }
  }

  // Now try to invoice this order with payment
  console.log("\n--- Getting payment type ---");
  const ptR = await api("GET", "/invoice/paymentType?count=1&fields=*");
  const pt = ptR.data.values[0];
  console.log("PaymentType:", pt.id, pt.description);

  console.log("\n--- Invoicing order ---");
  const invR = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=${today}&sendToCustomer=false&paymentTypeId=${pt.id}&paidAmount=0.01&paymentTypeIdRestAmount=${pt.id}`);
  if (invR.ok) {
    console.log("Invoice created:", invR.data.value.id, "outstanding:", invR.data.value.amountCurrencyOutstanding);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
