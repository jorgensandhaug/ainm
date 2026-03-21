// Test 1: Can we skip the GET /invoice/paymentType call by omitting paymentTypeId from the invoice write?
// Test 2: If not, what's the correct way to select a payment type?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const TODAY = "2026-03-21";

const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} -> ${res.status}`);
  if (!res.ok) {
    console.log("ERROR:", JSON.stringify(json).slice(0, 800));
  }
  return { ok: res.ok, status: res.status, data: json };
}

async function main() {
  // Get a customer
  const custRes = await api("GET", "/customer?fields=*&count=1");
  const customer = custRes.data.values?.[0];
  if (!customer) { console.log("No customer found"); return; }
  console.log(`Customer: id=${customer.id} name=${customer.name}`);

  // Get a product
  const prodRes = await api("GET", "/product?fields=*&count=2");
  const products = prodRes.data.values || [];
  if (products.length < 1) { console.log("No products found"); return; }
  console.log(`Product 0: id=${products[0].id} name=${products[0].name} number=${products[0].number}`);
  if (products[1]) console.log(`Product 1: id=${products[1].id} name=${products[1].name} number=${products[1].number}`);

  // Create order
  const orderPayload = {
    customer: { id: customer.id },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [
      {
        product: { id: products[0].id },
        description: products[0].name,
        count: 1,
        unitPriceExcludingVatCurrency: 1000,
      },
    ],
  };
  const orderRes = await api("POST", "/order", orderPayload);
  if (!orderRes.ok) { console.log("Order creation failed"); return; }
  const orderId = orderRes.data.value.id;
  console.log(`Order created: id=${orderId}`);

  // Test 1: Try converting order to invoice WITHOUT paymentTypeId — just to see if payment registration works without it
  console.log("\n--- TEST 1: Invoice without paymentTypeId ---");
  const invoicePath1 = `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false&paidAmount=0.01`;
  const invoiceRes1 = await api("PUT", invoicePath1);
  if (invoiceRes1.ok) {
    const inv = invoiceRes1.data.value;
    console.log(`Invoice: id=${inv.id} outstanding=${inv.amountCurrencyOutstanding}`);
    if (inv.amountCurrencyOutstanding === 0) {
      console.log("SUCCESS: Payment registered without paymentTypeId!");
    } else {
      console.log("Invoice created but no payment — paymentTypeId is needed for payment");
    }
  }

  // If test 1 created an invoice without payment, we need to test with paymentType
  // Create another order for test 2
  if (!invoiceRes1.ok || invoiceRes1.data.value?.amountCurrencyOutstanding !== 0) {
    console.log("\n--- TEST 2: Need paymentTypeId ---");

    // Check payment types
    const ptRes = await api("GET", "/invoice/paymentType?count=1000&fields=*");
    const pts = ptRes.data.values || [];
    console.log(`Payment types found: ${pts.length}`);
    for (const pt of pts) {
      console.log(`  id=${pt.id} desc="${pt.description}" keys=${Object.keys(pt).join(",")}`);
    }

    if (pts.length > 0) {
      // Create another order
      const orderRes2 = await api("POST", "/order", {
        customer: { id: customer.id },
        orderDate: TODAY,
        deliveryDate: TODAY,
        orderLines: [
          {
            product: { id: products[0].id },
            description: products[0].name,
            count: 1,
            unitPriceExcludingVatCurrency: 500,
          },
        ],
      });
      if (!orderRes2.ok) { console.log("Order 2 failed"); return; }
      const orderId2 = orderRes2.data.value.id;

      // Use the first payment type
      const ptId = pts[0].id;
      console.log(`Using paymentTypeId=${ptId}`);
      const invoicePath2 = `/order/${orderId2}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false&paymentTypeId=${ptId}&paidAmount=0.01&paymentTypeIdRestAmount=${ptId}`;
      const invoiceRes2 = await api("PUT", invoicePath2);
      if (invoiceRes2.ok) {
        const inv = invoiceRes2.data.value;
        console.log(`Invoice: id=${inv.id} outstanding=${inv.amountCurrencyOutstanding}`);
        if (inv.amountCurrencyOutstanding === 0) {
          console.log("SUCCESS: Full payment with first available paymentType");
        }
      }
    }
  }
}

main().catch(e => console.error("FATAL:", e));
