const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "qIk69sGmWovhqX1UUQj132acbhRDIzHBVPm-Bfld-wg";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const HEADERS = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: HEADERS };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json();
  if (!res.ok) {
    console.error(`${method} ${path} → ${res.status}`, JSON.stringify(json, null, 2));
    throw new Error(`${method} ${path} failed: ${res.status}`);
  }
  console.log(`${method} ${path} → ${res.status}`);
  return json;
}

async function main() {
  // 1. GET customer by org number
  const custResp = await api("GET", "/customer?organizationNumber=997470311&fields=*");
  const customer = custResp.values[0];
  if (!customer) throw new Error("Customer not found");
  console.log(`Customer: ${customer.name} (id=${customer.id})`);

  // 2. GET products by number (comma-separated OR)
  const prodResp = await api("GET", "/product?number=6293,5849&fields=*");
  const products = prodResp.values;
  if (products.length < 2) throw new Error(`Expected 2 products, got ${products.length}`);
  const maintenance = products.find((p: any) => String(p.number) === "6293");
  const softwareLicense = products.find((p: any) => String(p.number) === "5849");
  if (!maintenance || !softwareLicense) throw new Error("Could not match products by number");
  console.log(`Product: ${maintenance.name} (id=${maintenance.id}, number=${maintenance.number})`);
  console.log(`Product: ${softwareLicense.name} (id=${softwareLicense.id}, number=${softwareLicense.number})`);

  // 3. GET payment types
  const ptResp = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
  const paymentTypes = ptResp.values;
  // Find an incoming payment type (with debitAccount that is a bank account)
  const incomingPt = paymentTypes.find((pt: any) =>
    pt.debitAccount && pt.debitAccount.isBankAccount
  );
  if (!incomingPt) throw new Error("No incoming payment type found");
  console.log(`PaymentType: ${incomingPt.description} (id=${incomingPt.id})`);

  // 4. POST order
  const today = "2026-03-21";
  const orderPayload = {
    customer: { id: customer.id },
    orderDate: today,
    deliveryDate: today,
    orderLines: [
      {
        product: { id: maintenance.id },
        description: "Maintenance",
        count: 1,
        unitPriceExcludingVatCurrency: 21700,
      },
      {
        product: { id: softwareLicense.id },
        description: "Software License",
        count: 1,
        unitPriceExcludingVatCurrency: 2250,
      },
    ],
  };
  const orderResp = await api("POST", "/order", orderPayload);
  const orderId = orderResp.value.id;
  console.log(`Order created: id=${orderId}`);

  // 5. PUT order/:invoice (combined invoice + payment)
  const invoiceResp = await api(
    "PUT",
    `/order/${orderId}/:invoice?invoiceDate=${today}&sendToCustomer=false&paymentTypeId=${incomingPt.id}&paidAmount=0.01&paymentTypeIdRestAmount=${incomingPt.id}`
  );
  const invoice = invoiceResp.value;
  console.log(`Invoice created: id=${invoice.id}, number=${invoice.invoiceNumber}`);
  console.log(`Amount outstanding: ${invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding}`);

  if ((invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding) !== 0) {
    console.error("WARNING: Outstanding amount is not 0!");
  } else {
    console.log("Payment fully settled.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
