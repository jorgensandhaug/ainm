// Test if paymentTypeId is optional on PUT /order/:invoice
// If so, task 10 can go from 5 calls to 4
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json();
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 500));
  return { status: res.status, data: json };
}

async function main() {
  // Step 1: Get a customer
  const custRes = await api("GET", "/customer?fields=id,name&count=1");
  const custId = custRes.data?.values?.[0]?.id;
  console.log(`Customer: id=${custId}, name=${custRes.data?.values?.[0]?.name}`);

  // Step 2: Get a product
  const prodRes = await api("GET", "/product?count=1&fields=id,name,number");
  const prod = prodRes.data?.values?.[0];
  console.log(`Product: id=${prod?.id}, name=${prod?.name}, number=${prod?.number}`);

  // Step 3: Create order
  const orderRes = await api("POST", "/order", {
    customer: { id: custId },
    deliveryDate: "2026-03-21",
    orderDate: "2026-03-21",
    orderLines: [
      { product: { id: prod?.id }, count: 1, unitPriceExcludingVatCurrency: 1000 }
    ]
  });
  const orderId = orderRes.data?.value?.id;
  console.log(`Order: id=${orderId}`);

  if (!orderId) return;

  // Test 1: Try PUT /order/:invoice WITHOUT paymentTypeId
  console.log("\n=== Test 1: Invoice without paymentTypeId ===");
  const inv1 = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false`);
  if (inv1.status < 400) {
    console.log("  SUCCESS! paymentTypeId is optional");
    console.log("  Invoice:", JSON.stringify(inv1.data?.value, null, 2).slice(0, 500));
  }

  // If test 1 fails, create a new order and try with paidAmount=0 (no payment)
  if (inv1.status >= 400) {
    console.log("\n=== Test 2: Create new order, invoice with paidAmount=0 ===");
    const orderRes2 = await api("POST", "/order", {
      customer: { id: custId },
      deliveryDate: "2026-03-21",
      orderDate: "2026-03-21",
      orderLines: [
        { product: { id: prod?.id }, count: 1, unitPriceExcludingVatCurrency: 2000 }
      ]
    });
    const orderId2 = orderRes2.data?.value?.id;
    const inv2 = await api("PUT", `/order/${orderId2}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false&paidAmount=0`);
    if (inv2.status < 400) {
      console.log("  SUCCESS with paidAmount=0!");
      // Now try to register payment separately
      const invoiceId = inv2.data?.value?.id;
      console.log(`  Invoice id=${invoiceId}, outstanding=${inv2.data?.value?.amountOutstanding}`);

      // Check paymentTypes quickly
      const ptRes = await api("GET", "/invoice/paymentType?count=5&fields=id,description");
      for (const pt of (ptRes.data?.values || []).slice(0, 3)) {
        console.log(`  paymentType: id=${pt.id} desc=${pt.description}`);
      }
    }
  }

  // Test 3: Check if there's a default paymentType we can rely on
  console.log("\n=== Test 3: All paymentTypes ===");
  const allPt = await api("GET", "/invoice/paymentType?count=100&fields=id,description,debitAccount(id,number),creditAccount(id,number),isInactive");
  for (const pt of (allPt.data?.values || [])) {
    if (!pt.isInactive) {
      console.log(`  id=${pt.id} desc="${pt.description}" debit=${pt.debitAccount?.number} credit=${pt.creditAccount?.number}`);
    }
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
