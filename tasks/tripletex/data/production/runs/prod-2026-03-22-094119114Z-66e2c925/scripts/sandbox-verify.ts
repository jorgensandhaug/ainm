const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
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
  // 1. Resolve customer by org number
  const custRes = await api("GET", "/customer?organizationNumber=861379760&fields=*");
  if (custRes.status !== 200 || custRes.data.count === 0) {
    console.log("Customer not found"); return;
  }
  const customerId = custRes.data.values[0].id;
  console.log("Customer ID:", customerId);

  // 2. Resolve products comma-separated
  const prodRes = await api("GET", "/product?number=2109,1175,9974&fields=*");
  if (prodRes.status !== 200) {
    console.log("Product resolution failed"); return;
  }
  const products = prodRes.data.values as any[];
  console.log("Products found:", products.length);
  const byNumber: Record<string, any> = {};
  for (const p of products) {
    byNumber[String(p.number)] = p;
    console.log(`  Product ${p.number}: id=${p.id}, name=${p.name}, vatType.id=${p.vatType?.id}`);
  }

  const p2109 = byNumber["2109"];
  const p1175 = byNumber["1175"];
  const p9974 = byNumber["9974"];

  if (!p2109 || !p1175 || !p9974) {
    console.log("Missing products"); return;
  }

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

  const invRes = await api("POST", "/invoice?sendToCustomer=false", invoicePayload);
  if (invRes.status === 201) {
    const inv = invRes.data.value;
    console.log("Invoice created:", inv.id);
    console.log("Invoice number:", inv.invoiceNumber);
    console.log("Amount excl VAT:", inv.amountExcludingVatCurrency);
    console.log("Amount incl VAT:", inv.amountCurrency);

    // Readback for verification
    const readback = await api("GET", `/invoice/${inv.id}?fields=*,orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))`);
    if (readback.status === 200) {
      const rb = readback.data.value;
      console.log("\n--- Readback ---");
      console.log("Invoice ID:", rb.id);
      console.log("Amount excl VAT:", rb.amountExcludingVatCurrency);
      console.log("Amount incl VAT:", rb.amountCurrency);
      if (rb.invoiceLines) {
        for (const line of rb.invoiceLines) {
          console.log(`  Line: product=${line.product?.number}, desc=${line.description}, unitPrice=${line.unitPriceExcludingVatCurrency}, vatType=${line.vatType?.percentage}%`);
        }
      }
      if (rb.orders) {
        for (const order of rb.orders) {
          if (order.orderLines) {
            for (const ol of order.orderLines) {
              console.log(`  OrderLine: product=${ol.product?.number}, desc=${ol.description}, unitPrice=${ol.unitPriceExcludingVatCurrency}, vatType=${ol.vatType?.percentage}%`);
            }
          }
        }
      }
    }
  } else {
    console.log("Invoice creation failed with status:", invRes.status);
  }
}

main();
