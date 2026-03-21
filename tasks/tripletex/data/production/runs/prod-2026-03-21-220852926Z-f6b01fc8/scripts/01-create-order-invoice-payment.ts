const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "5Q2mZJ4DNgC33BYFCBJaSDZfx-Mb4O50jEu5tX0A8Qg";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const j = await r.json();
  if (!r.ok) { console.error("ERROR", r.status, JSON.stringify(j)); throw new Error(`${r.status}`); }
  return j;
}

async function main() {
  // 1. Get customer
  const custR = await api("GET", "/customer?organizationNumber=927161524&fields=*");
  const cust = custR.values[0];
  console.log("Customer:", cust.id, cust.name);

  // 2. Get products (comma-separated)
  const prodR = await api("GET", "/product?number=8400,2535&fields=*");
  console.log("Products returned:", prodR.count);
  const products = prodR.values;
  const p8400 = products.find((p: any) => String(p.number) === "8400");
  const p2535 = products.find((p: any) => String(p.number) === "2535");
  if (!p8400 || !p2535) { console.error("Missing products", products.map((p:any) => p.number)); throw new Error("products"); }
  console.log("Product 8400:", p8400.id, p8400.name);
  console.log("Product 2535:", p2535.id, p2535.name);

  // 3. Get payment types
  const ptR = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
  const pt = ptR.values[0];
  console.log("PaymentType:", pt.id, pt.description);

  // 4. Create order
  const today = new Date().toISOString().slice(0, 10);
  const order = await api("POST", "/order", {
    customer: { id: cust.id },
    orderDate: today,
    deliveryDate: today,
    orderLines: [
      { product: { id: p8400.id }, description: "Consultoria de dados", count: 1, unitPriceExcludingVatCurrency: 5700 },
      { product: { id: p2535.id }, description: "Design web", count: 1, unitPriceExcludingVatCurrency: 3850 },
    ]
  });
  const orderId = order.value.id;
  console.log("Order created:", orderId);

  // 5. Convert to invoice with full payment
  const inv = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=${today}&sendToCustomer=false&paymentTypeId=${pt.id}&paidAmount=0.01&paymentTypeIdRestAmount=${pt.id}`, undefined);
  console.log("Invoice:", inv.value.id, "number:", inv.value.invoiceNumber);
  console.log("Outstanding:", inv.value.amountCurrencyOutstanding ?? inv.value.amountOutstanding);
}

main().catch(e => { console.error(e); process.exit(1); });
