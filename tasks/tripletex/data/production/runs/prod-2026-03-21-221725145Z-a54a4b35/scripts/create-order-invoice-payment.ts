const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "avgQ-ehhF0miOBLv1KDB3j_RGJli5H4mNoEzfdtwFhc";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  if (!r.ok) {
    console.error(`${method} ${path} => ${r.status}`, JSON.stringify(json, null, 2));
    throw new Error(`${method} ${path} => ${r.status}`);
  }
  console.log(`${method} ${path} => ${r.status}`);
  return json;
}

async function main() {
  // 1. Resolve customer
  const custRes = await api("GET", "/customer?organizationNumber=937237243&fields=*");
  const customer = custRes.values?.[0];
  if (!customer) throw new Error("Customer not found");
  console.log(`Customer: ${customer.name} (id=${customer.id})`);

  // 2. Resolve products (comma-separated number filter, OR semantics)
  const prodRes = await api("GET", "/product?number=5700,2680&fields=*");
  const products = prodRes.values || [];
  const p1 = products.find((p: any) => String(p.number) === "5700");
  const p2 = products.find((p: any) => String(p.number) === "2680");
  if (!p1 || !p2) {
    console.error(`Found ${products.length} products, p1=${!!p1}, p2=${!!p2}`);
    throw new Error("Product resolution failed");
  }
  console.log(`Product 1: ${p1.name} (id=${p1.id}, number=${p1.number})`);
  console.log(`Product 2: ${p2.name} (id=${p2.id}, number=${p2.number})`);

  // 3. Resolve payment type
  const ptRes = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
  const pts = ptRes.values || [];
  if (pts.length === 0) throw new Error("No payment types found");
  const pt = pts[0];
  console.log(`Payment type: ${pt.description} (id=${pt.id})`);

  // 4. Create order with embedded lines
  const today = "2026-03-21";
  const orderBody = {
    customer: { id: customer.id },
    orderDate: today,
    deliveryDate: today,
    orderLines: [
      {
        product: { id: p1.id },
        description: "Informe de análisis",
        count: 1,
        unitPriceExcludingVatCurrency: 33200,
      },
      {
        product: { id: p2.id },
        description: "Diseño web",
        count: 1,
        unitPriceExcludingVatCurrency: 17200,
      },
    ],
  };
  const orderRes = await api("POST", "/order", orderBody);
  const orderId = orderRes.value.id;
  console.log(`Order created: id=${orderId}`);

  // 5. Convert to invoice and register payment in one call
  const invoicePath = `/order/${orderId}/:invoice?invoiceDate=${today}&sendToCustomer=false&paymentTypeId=${pt.id}&paidAmount=0.01&paymentTypeIdRestAmount=${pt.id}`;
  const invRes = await api("PUT", invoicePath);
  const inv = invRes.value;
  console.log(`Invoice created: id=${inv.id}, number=${inv.invoiceNumber}`);
  console.log(`Amount ex VAT: ${inv.amountExcludingVatCurrency}`);
  console.log(`Amount outstanding: ${inv.amountCurrencyOutstanding ?? inv.amountOutstanding}`);

  if ((inv.amountCurrencyOutstanding ?? inv.amountOutstanding) !== 0) {
    console.error("WARNING: Outstanding amount is not 0!");
  } else {
    console.log("Payment settled — outstanding = 0. Done.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
