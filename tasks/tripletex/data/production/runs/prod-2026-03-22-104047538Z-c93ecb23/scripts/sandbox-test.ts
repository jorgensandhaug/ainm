// Test: can we skip GET /product by hardcoding vatType on order lines?
// This would save the vatType(*) expansion but we still need product IDs.
// Also test: can paymentTypeId be hardcoded in sandbox?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} -> ${r.status}`);
  if (!r.ok) console.log("  ERROR:", JSON.stringify(json).slice(0, 300));
  return { status: r.status, data: json };
}

async function main() {
  // Check what payment types exist in sandbox
  const ptR = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
  const pts = ptR.data?.values || [];
  console.log(`Payment types: ${pts.length}`);
  for (const pt of pts) {
    console.log(`  id=${pt.id} desc=${pt.description} debit=${pt.debitAccount?.number} credit=${pt.creditAccount?.number}`);
  }

  // Check products available in sandbox
  const prodR = await api("GET", "/product?count=10&fields=id,number,name");
  const prods = prodR.data?.values || [];
  console.log(`\nProducts (first 10):`);
  for (const p of prods) {
    console.log(`  id=${p.id} number=${p.number} name=${p.name}`);
  }

  // Check customers in sandbox
  const custR = await api("GET", "/customer?count=5&fields=id,name,organizationNumber");
  const custs = custR.data?.values || [];
  console.log(`\nCustomers (first 5):`);
  for (const c of custs) {
    console.log(`  id=${c.id} name=${c.name} org=${c.organizationNumber}`);
  }

  // Test: POST /invoice with hardcoded vatType on order lines and product by ID
  // Only do this if we have at least 1 customer and 1 product
  if (custs.length > 0 && prods.length > 0) {
    const cust = custs[0];
    const prod = prods[0];
    console.log(`\nTest: POST /invoice with product id=${prod.id} and hardcoded vatType:{id:3}`);

    const testBody = {
      invoiceDate: "2026-03-22",
      invoiceDueDate: "2026-04-22",
      orders: [{
        customer: { id: cust.id },
        orderDate: "2026-03-22",
        deliveryDate: "2026-03-22",
        orderLines: [{
          product: { id: prod.id },
          description: "Test hardcoded vatType",
          count: 1,
          unitPriceExcludingVatCurrency: 1000,
          vatType: { id: 3 }
        }]
      }]
    };

    const pt = pts[0];
    const testR = await api("POST", `/invoice?sendToCustomer=false&paymentTypeId=${pt.id}&paidAmount=1250`, testBody);
    if (testR.status === 201) {
      const v = testR.data.value;
      console.log(`  SUCCESS: id=${v.id} amount=${v.amount} exVat=${v.amountExcludingVat} outstanding=${v.amountOutstanding}`);
      console.log(`  This proves: hardcoding vatType:{id:3} on order lines works in sandbox`);
      console.log(`  BUT: we still need GET /product to get the product ID - can't eliminate it`);
    }
  }
}

main().catch(e => console.error(e));
