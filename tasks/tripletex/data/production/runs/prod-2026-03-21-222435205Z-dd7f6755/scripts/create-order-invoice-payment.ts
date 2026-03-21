const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "7bYYWJiBU4SVAIAeyvOQKUDHifo3NKyYrl36ceM3f5A";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

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

// 1. GET customer
const custResp = await api("GET", "/customer?organizationNumber=927161524&fields=*");
const customer = custResp.values[0];
console.log("Customer:", customer.id, customer.name);

// 2. GET products (comma-separated)
const prodResp = await api("GET", "/product?number=8400,2535&fields=*");
const products = prodResp.values;
console.log("Products found:", products.length);
const p8400 = products.find((p: any) => String(p.number) === "8400");
const p2535 = products.find((p: any) => String(p.number) === "2535");
if (!p8400 || !p2535) throw new Error("Missing product(s)");
console.log("Product 8400:", p8400.id, p8400.name);
console.log("Product 2535:", p2535.id, p2535.name);

// 3. GET payment types
const ptResp = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
const paymentType = ptResp.values[0];
console.log("PaymentType:", paymentType.id, paymentType.description);

// 4. POST order
const orderResp = await api("POST", "/order", {
  customer: { id: customer.id },
  orderDate: TODAY,
  deliveryDate: TODAY,
  orderLines: [
    {
      product: { id: p8400.id },
      description: "Consultoria de dados",
      count: 1,
      unitPriceExcludingVatCurrency: 5700,
    },
    {
      product: { id: p2535.id },
      description: "Design web",
      count: 1,
      unitPriceExcludingVatCurrency: 3850,
    },
  ],
});
const orderId = orderResp.value.id;
console.log("Order created:", orderId);

// 5. PUT order/:invoice (combined invoice + payment)
const invResp = await api(
  "PUT",
  `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false&paymentTypeId=${paymentType.id}&paidAmount=0.01&paymentTypeIdRestAmount=${paymentType.id}`
);
const inv = invResp.value;
console.log("Invoice:", inv.id, "number:", inv.invoiceNumber);
console.log("Outstanding:", inv.amountOutstanding, "Currency outstanding:", inv.amountCurrencyOutstanding);

if (inv.amountOutstanding === 0 || inv.amountCurrencyOutstanding === 0) {
  console.log("DONE — fully paid");
} else {
  console.error("WARNING: outstanding not zero!");
}
