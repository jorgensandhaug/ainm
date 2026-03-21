// Investigate: can we skip GET /invoice/paymentType by omitting paymentTypeId
// from PUT /order/:invoice and letting Tripletex use a default?
// If yes, the canonical path drops from 5 calls to 4.

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
  console.log(`${method} ${path} => ${r.status}`);
  if (!r.ok) console.log("  Error:", JSON.stringify(json, null, 2));
  return { status: r.status, ok: r.ok, json };
}

async function main() {
  // Get a customer and product from sandbox
  const custRes = await api("GET", "/customer?count=1&fields=id,name");
  const cust = custRes.json.values?.[0];
  if (!cust) { console.log("No customer in sandbox"); return; }
  console.log(`Customer: ${cust.name} (id=${cust.id})`);

  const prodRes = await api("GET", "/product?count=2&fields=id,name,number");
  const prods = prodRes.json.values || [];
  if (prods.length < 1) { console.log("No products in sandbox"); return; }
  console.log(`Products: ${prods.map((p:any) => `${p.name}(${p.id})`).join(", ")}`);

  const today = "2026-03-21";

  // Create an order
  const orderBody = {
    customer: { id: cust.id },
    orderDate: today,
    deliveryDate: today,
    orderLines: [
      {
        product: { id: prods[0].id },
        description: "Test line",
        count: 1,
        unitPriceExcludingVatCurrency: 100,
      },
    ],
  };
  const orderRes = await api("POST", "/order", orderBody);
  if (!orderRes.ok) return;
  const orderId = orderRes.json.value.id;
  console.log(`Order created: id=${orderId}`);

  // TEST 1: Try PUT /order/:invoice WITHOUT paymentTypeId at all (just invoice, no payment)
  // Then check if we can pay separately without knowing paymentTypeId
  // Actually, let's test: omit paymentTypeId but include paidAmount
  console.log("\n--- TEST 1: Invoice with paidAmount but NO paymentTypeId ---");
  const test1 = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=${today}&sendToCustomer=false&paidAmount=0.01`);
  if (test1.ok) {
    const inv = test1.json.value;
    console.log(`Invoice outstanding: ${inv.amountCurrencyOutstanding ?? inv.amountOutstanding}`);
    console.log("SUCCESS: Can skip paymentTypeId! This would be a 4-call path.");
  } else {
    console.log("FAILED: paymentTypeId required when paidAmount is specified.");

    // TEST 2: Try invoice-only (no payment params) then handle payment separately
    // First, create another order for this test
    const order2Res = await api("POST", "/order", orderBody);
    if (!order2Res.ok) return;
    const order2Id = order2Res.json.value.id;
    console.log(`\nOrder 2 created: id=${order2Id}`);

    console.log("\n--- TEST 2: Invoice-only, no payment params ---");
    const test2 = await api("PUT", `/order/${order2Id}/:invoice?invoiceDate=${today}&sendToCustomer=false`);
    if (test2.ok) {
      const inv2 = test2.json.value;
      console.log(`Invoice id=${inv2.id}, outstanding=${inv2.amountCurrencyOutstanding ?? inv2.amountOutstanding}`);

      // Now try to pay without explicit paymentTypeId - use PUT /invoice/:payment
      // with no paymentTypeId, just the amount
      console.log("\n--- TEST 2b: Pay without paymentTypeId ---");
      const outstanding = inv2.amountCurrencyOutstanding ?? inv2.amountOutstanding;
      const test2b = await api("PUT", `/invoice/${inv2.id}/:payment?paymentDate=${today}&paidAmount=${outstanding}`);
      if (test2b.ok) {
        console.log("SUCCESS: Can pay without explicit paymentTypeId!");
      } else {
        console.log("FAILED: paymentTypeId required for payment too.");
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
