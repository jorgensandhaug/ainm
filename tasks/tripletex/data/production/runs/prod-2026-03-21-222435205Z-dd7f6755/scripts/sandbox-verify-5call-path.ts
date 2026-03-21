// Sandbox verification: prove the 5-call canonical path works end-to-end
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: h };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  if (!r.ok) {
    console.error(`${method} ${path} => ${r.status}`, JSON.stringify(json, null, 2));
    throw new Error(`${method} ${path} failed: ${r.status}`);
  }
  console.log(`${method} ${path} => ${r.status}`);
  return json;
}

// Step 1: Find a customer
const custResp = await api("GET", "/customer?count=1&fields=*");
const customer = custResp.values[0];
console.log("Customer:", customer.id, customer.name, customer.organizationNumber);

// Step 2: Find products via comma-separated number
const prodResp = await api("GET", "/product?count=5&fields=*");
const allProducts = prodResp.values;
if (allProducts.length < 2) throw new Error("Not enough products in sandbox");
const p1 = allProducts[0];
const p2 = allProducts[1];
console.log("Product 1:", p1.id, p1.number, p1.name);
console.log("Product 2:", p2.id, p2.number, p2.name);

// Now test comma-separated number lookup with these product numbers
const commaResp = await api("GET", `/product?number=${p1.number},${p2.number}&fields=*`);
console.log("Comma lookup found:", commaResp.values.length, "products");
const found1 = commaResp.values.find((p: any) => String(p.number) === String(p1.number));
const found2 = commaResp.values.find((p: any) => String(p.number) === String(p2.number));
console.log("Found p1:", !!found1, "Found p2:", !!found2);

// Step 3: Get payment types
const ptResp = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
const paymentType = ptResp.values[0];
console.log("PaymentType:", paymentType.id, paymentType.description);

// Step 4: Create order with embedded lines
const orderResp = await api("POST", "/order", {
  customer: { id: customer.id },
  orderDate: "2026-03-21",
  deliveryDate: "2026-03-21",
  orderLines: [
    {
      product: { id: p1.id },
      description: p1.name,
      count: 1,
      unitPriceExcludingVatCurrency: 1000,
    },
    {
      product: { id: p2.id },
      description: p2.name,
      count: 1,
      unitPriceExcludingVatCurrency: 500,
    },
  ],
});
const orderId = orderResp.value.id;
console.log("Order created:", orderId);

// Step 5: Combined invoice + payment
const invResp = await api(
  "PUT",
  `/order/${orderId}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false&paymentTypeId=${paymentType.id}&paidAmount=0.01&paymentTypeIdRestAmount=${paymentType.id}`
);
const inv = invResp.value;
console.log("Invoice:", inv.id, "number:", inv.invoiceNumber);
console.log("Outstanding:", inv.amountOutstanding, "Currency outstanding:", inv.amountCurrencyOutstanding);

if (inv.amountOutstanding === 0 || inv.amountCurrencyOutstanding === 0) {
  console.log("SUCCESS: Fully paid, 5-call path verified");
} else {
  console.error("FAILURE: Outstanding not zero!");
}
