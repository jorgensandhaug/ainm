const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "JjzrjUpo1Pe4go1w9vPCv9c_3rw6hOzstVLvHWqNPCc";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const TODAY = "2026-03-21";

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json();
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) {
    console.error(JSON.stringify(json, null, 2));
    throw new Error(`${method} ${path} failed with ${res.status}`);
  }
  return json;
}

async function main() {
  // 1. GET customer by org number
  const custRes = await api("GET", "/customer?organizationNumber=867069526&fields=*");
  const customer = custRes.values[0];
  console.log(`Customer: ${customer.name} (id=${customer.id})`);

  // 2. GET all products, filter locally by number field
  const prodRes = await api("GET", "/product?count=1000&fields=*");
  const products = prodRes.values as any[];
  const p4466 = products.find((p: any) => String(p.number) === "4466");
  const p3717 = products.find((p: any) => String(p.number) === "3717");
  if (!p4466) throw new Error("Product 4466 not found");
  if (!p3717) throw new Error("Product 3717 not found");
  console.log(`Product 4466: ${p4466.name} (id=${p4466.id})`);
  console.log(`Product 3717: ${p3717.name} (id=${p3717.id})`);

  // 3. GET payment types
  const ptRes = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
  const paymentTypes = ptRes.values as any[];
  // Find an incoming payment type (for customer payments)
  const incomingPt = paymentTypes.find((pt: any) =>
    pt.debitAccount && pt.debitAccount.number >= 1900 && pt.debitAccount.number <= 1999
  );
  if (!incomingPt) throw new Error("No incoming payment type found");
  console.log(`Payment type: ${incomingPt.description} (id=${incomingPt.id})`);

  // 4. POST order with order lines
  const orderBody = {
    customer: { id: customer.id },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [
      {
        product: { id: p4466.id },
        description: "Sessão de formação",
        count: 1,
        unitPriceExcludingVatCurrency: 35600,
      },
      {
        product: { id: p3717.id },
        description: "Licença de software",
        count: 1,
        unitPriceExcludingVatCurrency: 3250,
      },
    ],
  };
  const orderRes = await api("POST", "/order", orderBody);
  const orderId = orderRes.value.id;
  console.log(`Order created: id=${orderId}`);

  // 5. PUT invoice + payment in one call
  const invoicePath = `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false&paymentTypeId=${incomingPt.id}&paidAmount=0.01&paymentTypeIdRestAmount=${incomingPt.id}`;
  const invoiceRes = await api("PUT", invoicePath);
  const invoice = invoiceRes.value;
  console.log(`Invoice created: id=${invoice.id}, number=${invoice.invoiceNumber}`);
  console.log(`Amount outstanding: ${invoice.amountOutstanding ?? invoice.amountCurrencyOutstanding}`);

  const outstanding = invoice.amountOutstanding ?? invoice.amountCurrencyOutstanding ?? 0;
  if (outstanding === 0) {
    console.log("SUCCESS: Invoice fully paid, outstanding = 0");
  } else {
    console.log(`WARNING: Outstanding amount is ${outstanding}, expected 0`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
