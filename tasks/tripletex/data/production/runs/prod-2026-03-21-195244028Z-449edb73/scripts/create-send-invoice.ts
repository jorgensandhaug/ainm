const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "cs0VPY6_EgwmmNyKRyb92JWitw0mcFPhLJ7PsFCc07c";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`\n>>> ${method} ${url}`);
  const opts: RequestInit = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`<<< ${res.status}`);
  console.log(JSON.stringify(json, null, 2));
  if (!res.ok) throw new Error(`API ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  // 1. Resolve customer
  const custRes = await api("GET", "/customer?organizationNumber=890733751&fields=*");
  const customers = custRes.values;
  if (!customers || customers.length === 0) throw new Error("Customer not found");
  const customer = customers[0];
  console.log(`\nCustomer: ${customer.name} (id=${customer.id})`);

  // 2. Resolve product - search all products for "Systemutvikling"
  const prodRes = await api("GET", "/product?count=1000&fields=*");
  const products = prodRes.values || [];
  const product = products.find((p: any) =>
    p.name && p.name.toLowerCase().includes("systemutvikling")
  );
  if (!product) {
    console.log("Available products:", products.map((p: any) => `${p.id}: ${p.name} (number=${p.number})`));
    throw new Error("No product matching 'Systemutvikling' found");
  }
  console.log(`\nProduct: ${product.name} (id=${product.id}, number=${product.number})`);

  // 3. Create order
  const orderPayload = {
    customer: { id: customer.id },
    orderDate: "2026-03-21",
    deliveryDate: "2026-03-21",
    orderLines: [
      {
        product: { id: product.id },
        description: "Systemutvikling",
        count: 1,
        unitPriceExcludingVatCurrency: 28900,
      },
    ],
  };
  const orderRes = await api("POST", "/order", orderPayload);
  const orderId = orderRes.value.id;
  console.log(`\nOrder created: id=${orderId}`);

  // 4. Convert to invoice and send to customer
  const invoiceRes = await api(
    "PUT",
    `/order/${orderId}/:invoice?invoiceDate=2026-03-21&sendToCustomer=true`
  );
  const invoice = invoiceRes.value;
  console.log(`\nInvoice created and sent:`);
  console.log(`  id=${invoice.id}`);
  console.log(`  invoiceNumber=${invoice.invoiceNumber}`);
  console.log(`  amountExcludingVatCurrency=${invoice.amountExcludingVatCurrency}`);
  console.log(`  amountCurrency=${invoice.amountCurrency}`);
  console.log(`  amountCurrencyOutstanding=${invoice.amountCurrencyOutstanding}`);
  console.log(`  isSent=${invoice.isSent}`);
}

main().catch((e) => { console.error("\nFATAL:", e.message); process.exit(1); });
