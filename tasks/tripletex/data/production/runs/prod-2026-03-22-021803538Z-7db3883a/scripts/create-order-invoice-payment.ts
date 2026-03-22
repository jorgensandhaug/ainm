const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "Ht-KUPrrSwoB8WFAAI9fswu_OrNMq6stX5BEUkMryNE";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";

const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const j = await r.json();
  if (!r.ok) { console.error("GET", path, r.status, JSON.stringify(j)); throw new Error(`GET ${path} ${r.status}`); }
  return j;
}

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) { console.error("POST", path, r.status, JSON.stringify(j)); throw new Error(`POST ${path} ${r.status}`); }
  return j;
}

async function put(path: string) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h });
  const j = await r.json();
  if (!r.ok) { console.error("PUT", path, r.status, JSON.stringify(j)); throw new Error(`PUT ${path} ${r.status}`); }
  return j;
}

async function main() {
  // 1. Resolve customer
  const custResp = await get("/customer?organizationNumber=953795493&fields=*");
  const cust = custResp.values[0];
  console.log("Customer:", cust.id, cust.name);

  // 2. Resolve products
  const prodResp = await get("/product?number=6272,7628&fields=*");
  const prods = prodResp.values;
  console.log("Products found:", prods.length);
  const p6272 = prods.find((p: any) => String(p.number) === "6272");
  const p7628 = prods.find((p: any) => String(p.number) === "7628");
  if (!p6272 || !p7628) {
    console.error("Missing product(s). Found:", prods.map((p: any) => `${p.number}/${p.name}`));
    // Fallback to count=1000
    const allResp = await get("/product?count=1000&fields=*");
    const all = allResp.values;
    const fb6272 = all.find((p: any) => String(p.number) === "6272");
    const fb7628 = all.find((p: any) => String(p.number) === "7628");
    if (!fb6272 || !fb7628) throw new Error("Products not found even with fallback");
    Object.assign(p6272 || {}, fb6272);
    Object.assign(p7628 || {}, fb7628);
  }
  console.log("Product 6272:", p6272!.id, p6272!.name);
  console.log("Product 7628:", p7628!.id, p7628!.name);

  // 3. Resolve payment type
  const ptResp = await get("/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
  const pt = ptResp.values[0];
  console.log("Payment type:", pt.id, pt.description);

  // 4. Create order
  const orderResp = await post("/order", {
    customer: { id: cust.id },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [
      {
        product: { id: p6272!.id },
        description: "Rapport d'analyse",
        count: 1,
        unitPriceExcludingVatCurrency: 30600
      },
      {
        product: { id: p7628!.id },
        description: "Heures de conseil",
        count: 1,
        unitPriceExcludingVatCurrency: 2350
      }
    ]
  });
  const orderId = orderResp.value.id;
  console.log("Order created:", orderId);

  // 5. Convert to invoice with payment
  const invResp = await put(
    `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false&paymentTypeId=${pt.id}&paidAmount=0.01&paymentTypeIdRestAmount=${pt.id}`
  );
  const inv = invResp.value;
  console.log("Invoice:", inv.id, "number:", inv.invoiceNumber);
  console.log("Amount outstanding:", inv.amountCurrencyOutstanding ?? inv.amountOutstanding);
  console.log("Done. Total API calls: 5");
}

main().catch(e => { console.error(e); process.exit(1); });
