const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "b7v4ejSJo5rpyYAXAv0bU2JYs-LZpYLejNqKGWegcl4";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const TODAY = "2026-03-21";

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  if (!r.ok) {
    console.error(`${method} ${path} => ${r.status}`);
    console.error(JSON.stringify(json, null, 2));
    throw new Error(`${method} ${path} failed ${r.status}`);
  }
  console.log(`${method} ${path} => ${r.status}`);
  return json;
}

function resolveProducts(products: any[], refs: string[]): Record<string, any> {
  const map: Record<string, any> = {};
  for (const p of products) {
    for (const key of ["productNumber", "number"]) {
      const val = String(p[key] ?? "");
      if (refs.includes(val) && !map[val]) {
        map[val] = p;
      }
    }
  }
  return map;
}

async function main() {
  // 1. Resolve customer
  const custResp = await api("GET", "/customer?organizationNumber=966920963&fields=*");
  const customer = custResp.values[0];
  console.log(`Customer: id=${customer.id} name=${customer.name}`);

  // 2. Resolve products - first try productNumber
  const prodResp = await api("GET", "/product?productNumber=5271&productNumber=3613&fields=*");
  let prodMap = resolveProducts(prodResp.values, ["5271", "3613"]);

  // Fallback: try ids
  if (!prodMap["5271"] || !prodMap["3613"]) {
    console.log("First product lookup incomplete, trying ids fallback...");
    const missingRefs = ["5271", "3613"].filter(r => !prodMap[r]);
    const idResp = await api("GET", `/product?ids=${missingRefs.join(",")}&fields=*`);
    const fallbackMap = resolveProducts(idResp.values, missingRefs);
    Object.assign(prodMap, fallbackMap);
  }

  // Final fallback: full product list + name filter
  if (!prodMap["5271"] || !prodMap["3613"]) {
    console.log("ID lookup incomplete, trying full product list...");
    const allResp = await api("GET", "/product?count=1000&fields=*");
    const nameMap: Record<string, string> = {
      "Desarrollo de sistemas": "5271",
      "Asesoría de datos": "3613",
    };
    for (const p of allResp.values) {
      const ref = nameMap[p.name];
      if (ref && !prodMap[ref]) {
        prodMap[ref] = p;
      }
    }
  }

  console.log(`Product 5271: id=${prodMap["5271"]?.id} name=${prodMap["5271"]?.name}`);
  console.log(`Product 3613: id=${prodMap["3613"]?.id} name=${prodMap["3613"]?.name}`);

  if (!prodMap["5271"] || !prodMap["3613"]) {
    throw new Error("Could not resolve both products");
  }

  // 3. Resolve payment type
  const ptResp = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
  const paymentTypes = ptResp.values;
  let chosen: any = null;
  for (const pt of paymentTypes) {
    const da = pt.debitAccount;
    if (!da) continue;
    const acctNum = String(da.number);
    if (acctNum.startsWith("19")) {
      chosen = pt;
      if (da.isBankAccount || da.isInvoiceAccount) break;
    }
  }
  if (!chosen) throw new Error("No suitable payment type found");
  console.log(`PaymentType: id=${chosen.id} description=${chosen.description}`);

  // 4. Create order
  const orderBody = {
    customer: { id: customer.id },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [
      {
        product: { id: prodMap["5271"].id },
        description: "Desarrollo de sistemas",
        count: 1,
        unitPriceExcludingVatCurrency: 6950,
      },
      {
        product: { id: prodMap["3613"].id },
        description: "Asesoría de datos",
        count: 1,
        unitPriceExcludingVatCurrency: 7000,
      },
    ],
  };
  const orderResp = await api("POST", "/order", orderBody);
  const orderId = orderResp.value.id;
  console.log(`Order created: id=${orderId}`);

  // 5. Convert to invoice with combined payment
  const invoicePath = `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false&paymentTypeId=${chosen.id}&paidAmount=0.01&paymentTypeIdRestAmount=${chosen.id}`;
  const invResp = await api("PUT", invoicePath);
  const inv = invResp.value;
  console.log(`Invoice created: id=${inv.id} invoiceNumber=${inv.invoiceNumber}`);
  console.log(`amountExcludingVatCurrency=${inv.amountExcludingVatCurrency}`);
  console.log(`amountCurrencyOutstanding=${inv.amountCurrencyOutstanding}`);
  console.log(`amountOutstanding=${inv.amountOutstanding}`);

  if ((inv.amountCurrencyOutstanding ?? inv.amountOutstanding) === 0) {
    console.log("Invoice fully paid. Done.");
  } else {
    console.log("WARNING: outstanding amount is not zero");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
