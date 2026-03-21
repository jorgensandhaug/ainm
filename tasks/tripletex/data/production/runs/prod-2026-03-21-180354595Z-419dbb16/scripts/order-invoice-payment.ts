const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "akOocsBL3V9DgfUMa16d4ulekC51rLghl1sfw_gunEQ";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };
const TODAY = "2026-03-21";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(json, null, 2)); throw new Error(`${r.status}`); }
  return json;
}

async function main() {
  // 1. Get customer
  const custRes = await api("GET", "/customer?organizationNumber=904130338&fields=*");
  const customer = custRes.values[0];
  console.log(`Customer: ${customer.id} - ${customer.name}`);

  // 2. Get products
  const prodRes = await api("GET", "/product?count=1000&fields=*");
  const products = prodRes.values as any[];
  console.log("All products:", products.map((p: any) => ({ id: p.id, number: p.number, productNumber: p.productNumber, name: p.name })));
  const p6247 = products.find((p: any) => p.number === 6247 || p.productNumber === 6247 || String(p.number) === "6247" || String(p.productNumber) === "6247");
  const p5919 = products.find((p: any) => p.number === 5919 || p.productNumber === 5919 || String(p.number) === "5919" || String(p.productNumber) === "5919");
  if (!p6247 || !p5919) throw new Error(`Products not found: 6247=${!!p6247}, 5919=${!!p5919}`);
  console.log(`Product 6247: id=${p6247.id} name=${p6247.name}`);
  console.log(`Product 5919: id=${p5919.id} name=${p5919.name}`);

  // 3. Get payment types
  const ptRes = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
  const paymentTypes = ptRes.values as any[];
  // Find an incoming payment type (for customer payments)
  const incoming = paymentTypes.find((pt: any) =>
    pt.debitAccount?.number >= 1900 && pt.debitAccount?.number < 2000
  );
  if (!incoming) throw new Error("No incoming payment type found");
  console.log(`PaymentType: id=${incoming.id} desc=${incoming.description}`);

  // 4. Create order
  const orderBody = {
    customer: { id: customer.id },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [
      {
        product: { id: p6247.id },
        description: "Serviço de rede",
        count: 1,
        unitPriceExcludingVatCurrency: 15250,
      },
      {
        product: { id: p5919.id },
        description: "Desenvolvimento de sistemas",
        count: 1,
        unitPriceExcludingVatCurrency: 13250,
      },
    ],
  };
  const orderRes = await api("POST", "/order", orderBody);
  const orderId = orderRes.value.id;
  console.log(`Order created: id=${orderId}`);

  // 5. Invoice + payment in one call
  const invoiceRes = await api(
    "PUT",
    `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false&paymentTypeId=${incoming.id}&paidAmount=0.01&paymentTypeIdRestAmount=${incoming.id}`
  );
  const inv = invoiceRes.value;
  console.log(`Invoice: id=${inv.id} number=${inv.invoiceNumber}`);
  console.log(`Outstanding: ${inv.amountCurrencyOutstanding ?? inv.amountOutstanding}`);
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
