// Prove the optimal catalog-read path for "names + parenthetical numbers" pattern
// Using existing sandbox products: 4783 "Sessão de formação", 3343 "Armazenamento na nuvem", 4380 "Serviço de rede"
// Using existing sandbox customer by organizationNumber
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  const json = await r.json();
  console.log(`${method} ${path} -> ${r.status}`);
  if (!r.ok) console.log("  ERROR:", JSON.stringify(json));
  return { status: r.status, data: json };
}

async function main() {
  // Step 1: Resolve customer (use a known sandbox customer)
  const custRes = await api("GET", "/customer?organizationNumber=919172657&fields=*");
  const customers = custRes.data?.values;
  if (!customers?.length) {
    // Try another known customer
    console.log("Customer 919172657 not found, trying 827304212...");
    const custRes2 = await api("GET", "/customer?organizationNumber=827304212&fields=*");
    const customers2 = custRes2.data?.values;
    if (!customers2?.length) { console.error("No customers found"); return; }
    var customer = customers2[0];
  } else {
    var customer = customers[0];
  }
  console.log(`  Customer: id=${customer.id} name="${customer.name}"`);

  // Step 2: Catalog read + local filter (simulating the "names + parenthetical numbers" pattern)
  const prodRes = await api("GET", "/product?count=1000&fields=*");
  const allProducts = prodRes.data?.values || [];

  // Filter locally by number
  const byNumber: Record<string, any> = {};
  for (const p of allProducts) if (p.number) byNumber[String(p.number)] = p;

  const prod1 = byNumber["4783"];
  const prod2 = byNumber["3343"];
  const prod3 = byNumber["4380"];

  if (!prod1 || !prod2 || !prod3) {
    console.error("Products not found in catalog by number");
    return;
  }
  console.log(`  Products resolved: ${prod1.name} (${prod1.number}), ${prod2.name} (${prod2.number}), ${prod3.name} (${prod3.number})`);
  console.log(`  Product VAT IDs: ${prod1.vatType?.id}, ${prod2.vatType?.id}, ${prod3.vatType?.id}`);

  // Step 3: Create invoice with product VAT inherited
  const payload = {
    invoiceDate: "2026-03-21",
    invoiceDueDate: "2026-04-20",
    customer: { id: customer.id },
    orders: [{
      orderDate: "2026-03-21",
      deliveryDate: "2026-03-21",
      customer: { id: customer.id },
      orderLines: [
        {
          product: { id: prod1.id },
          description: "Nettverksteneste",
          count: 1,
          unitPriceExcludingVatCurrency: 13150,
          vatType: { id: prod1.vatType.id },
        },
        {
          product: { id: prod2.id },
          description: "Konsulenttimar",
          count: 1,
          unitPriceExcludingVatCurrency: 11800,
          vatType: { id: prod2.vatType.id },
        },
        {
          product: { id: prod3.id },
          description: "Vedlikehald",
          count: 1,
          unitPriceExcludingVatCurrency: 8700,
          vatType: { id: prod3.vatType.id },
        },
      ],
    }],
  };

  const invRes = await api("POST", "/invoice?sendToCustomer=false", payload);

  if (invRes.status === 201 || invRes.status === 200) {
    const inv = invRes.data?.value;
    console.log("  SUCCESS - 3 API calls total");
    console.log(`  Invoice ID: ${inv?.id}`);
    console.log(`  Invoice Number: ${inv?.invoiceNumber}`);
    console.log(`  Amount excl VAT: ${inv?.amountExcludingVatCurrency}`);
    console.log(`  Amount incl VAT: ${inv?.amountCurrency}`);
    console.log(`  Expected excl: 33650 (13150+11800+8700)`);
  } else {
    console.log("  Invoice creation failed");
  }
}

main().catch(console.error);
