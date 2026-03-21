// Test: can we use paymentTypeId=1 or skip it? Can we find it from /order response?

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
  const custR = await api("GET", "/customer?count=1&fields=id");
  const cust = custR.data.values[0];

  const prodR = await api("GET", "/product?count=1&fields=id,number");
  const prod = prodR.data.values[0];

  const today = new Date().toISOString().slice(0, 10);

  // Create an order to test invoice conversion
  const orderR = await api("POST", "/order", {
    customer: { id: cust.id },
    orderDate: today,
    deliveryDate: today,
    orderLines: [{ product: { id: prod.id }, description: "PaymentType test", count: 1, unitPriceExcludingVatCurrency: 100 }]
  });
  const orderId = orderR.data.value.id;
  console.log("Order:", orderId);

  // Test 1: invoice without any paymentTypeId (no payment)
  console.log("\n--- Test 1: invoice without paymentTypeId ---");
  const t1 = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=${today}&sendToCustomer=false`);
  if (t1.ok) {
    const inv = t1.data.value;
    console.log("Invoice:", inv.id, "outstanding:", inv.amountCurrencyOutstanding);

    // Now we have an unpaid invoice. What paymentType is embedded?
    console.log("\n--- Check invoice for embedded payment type ---");
    const invR = await api("GET", `/invoice/${inv.id}?fields=*`);
    if (invR.ok) {
      const invData = invR.data.value;
      console.log("Invoice paymentType:", JSON.stringify(invData.paymentType));
      console.log("Invoice paymentTypeId:", invData.paymentTypeId);
    }
  }

  // Test 2: create another order, try paymentTypeId=1
  console.log("\n--- Test 2: try paymentTypeId=1 ---");
  const order2R = await api("POST", "/order", {
    customer: { id: cust.id },
    orderDate: today,
    deliveryDate: today,
    orderLines: [{ product: { id: prod.id }, description: "PT test 2", count: 1, unitPriceExcludingVatCurrency: 100 }]
  });
  const orderId2 = order2R.data.value.id;
  const t2 = await api("PUT", `/order/${orderId2}/:invoice?invoiceDate=${today}&sendToCustomer=false&paymentTypeId=1&paidAmount=0.01&paymentTypeIdRestAmount=1`);
  if (t2.ok) {
    console.log("Invoice with pt=1:", t2.data.value.id, "outstanding:", t2.data.value.amountCurrencyOutstanding);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
