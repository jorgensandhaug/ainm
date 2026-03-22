const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "W1GyK15OVst45aII7I-xhBztap4YW0bm1FLt9TFHh7o";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  console.log(`${method} ${path} -> ${r.status}`);
  if (!r.ok) console.log(JSON.stringify(json, null, 2));
  return { status: r.status, data: json };
}

async function main() {
  // 1. Resolve customer
  const custRes = await api("GET", "/customer?organizationNumber=861379760&fields=*");
  if (custRes.status !== 200 || custRes.data.count === 0) {
    console.log("Customer not found"); return;
  }
  const customerId = custRes.data.values[0].id;
  console.log("Customer ID:", customerId);

  // 2. Resolve products (comma-separated number, OR semantics)
  const prodRes = await api("GET", "/product?number=2109,1175,9974&fields=*");
  if (prodRes.status !== 200 || prodRes.data.count < 3) {
    console.log("Products not fully resolved, got", prodRes.data.count); return;
  }
  const products = prodRes.data.values as any[];
  const byNumber: Record<string, any> = {};
  for (const p of products) byNumber[String(p.number)] = p;

  const p2109 = byNumber["2109"];
  const p1175 = byNumber["1175"];
  const p9974 = byNumber["9974"];

  if (!p2109 || !p1175 || !p9974) {
    console.log("Missing product mapping", Object.keys(byNumber)); return;
  }

  console.log("Products resolved:", Object.keys(byNumber));
  console.log("VAT IDs:", p2109.vatType?.id, p1175.vatType?.id, p9974.vatType?.id);

  // 3. Create invoice
  const today = "2026-03-22";
  const invoicePayload = {
    invoiceDate: today,
    invoiceDueDate: "2026-04-21",
    customer: { id: customerId },
    orders: [
      {
        orderDate: today,
        deliveryDate: today,
        customer: { id: customerId },
        orderLines: [
          {
            product: { id: p2109.id },
            description: p2109.name || "Mantenimiento",
            count: 1,
            unitPriceExcludingVatCurrency: 27500,
            vatType: { id: p2109.vatType.id },
          },
          {
            product: { id: p1175.id },
            description: p1175.name || "Horas de consultoría",
            count: 1,
            unitPriceExcludingVatCurrency: 3900,
            vatType: { id: p1175.vatType.id },
          },
          {
            product: { id: p9974.id },
            description: p9974.name || "Informe de análisis",
            count: 1,
            unitPriceExcludingVatCurrency: 3400,
            vatType: { id: p9974.vatType.id },
          },
        ],
      },
    ],
  };

  let invRes = await api("POST", "/invoice?sendToCustomer=false", invoicePayload);

  // Bank account repair if needed
  if (invRes.status === 422) {
    const msg = JSON.stringify(invRes.data);
    if (msg.includes("bankkontonummer") || msg.includes("bank account")) {
      console.log("Bank account repair needed");
      const bankRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
      if (bankRes.status === 200 && bankRes.data.count > 0) {
        const acct = bankRes.data.values[0];
        await api("PUT", `/ledger/account/${acct.id}`, {
          ...acct,
          bankAccountNumber: "12345678903",
        });
        invRes = await api("POST", "/invoice?sendToCustomer=false", invoicePayload);
      }
    }
  }

  if (invRes.status === 201) {
    const inv = invRes.data.value;
    console.log("Invoice created:", inv.id);
    console.log("Invoice number:", inv.invoiceNumber);
    console.log("Amount excl VAT:", inv.amountExcludingVatCurrency);
    console.log("Amount incl VAT:", inv.amountCurrency);
  } else {
    console.log("Invoice creation failed");
  }
}

main();
