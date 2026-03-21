// Test: Can POST /order accept customer by organizationNumber instead of id?
// If yes, we skip the GET /customer call entirely.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const j = await r.json();
  console.log(method, path.substring(0,80), "→", r.status);
  if (!r.ok) console.log("  Error:", JSON.stringify(j).substring(0, 300));
  return { ok: r.ok, status: r.status, data: j };
}

async function main() {
  // First, find an existing customer and product in the sandbox
  const custR = await api("GET", "/customer?count=1&fields=id,name,organizationNumber");
  if (!custR.ok || custR.data.count === 0) { console.log("No customers in sandbox"); return; }
  const cust = custR.data.values[0];
  console.log("Sandbox customer:", cust.id, cust.name, "org:", cust.organizationNumber);

  const prodR = await api("GET", "/product?count=2&fields=id,name,number");
  if (!prodR.ok || prodR.data.count === 0) { console.log("No products in sandbox"); return; }
  const prods = prodR.data.values;
  console.log("Sandbox products:", prods.map((p:any) => `${p.id}/${p.number}/${p.name}`));

  const today = new Date().toISOString().slice(0, 10);

  // Test 1: POST /order with customer: { organizationNumber } instead of { id }
  console.log("\n--- Test 1: customer by organizationNumber ---");
  const t1 = await api("POST", "/order", {
    customer: { organizationNumber: cust.organizationNumber },
    orderDate: today,
    deliveryDate: today,
    orderLines: [
      { product: { id: prods[0].id }, description: "Test inline customer", count: 1, unitPriceExcludingVatCurrency: 100 }
    ]
  });
  if (t1.ok) console.log("  SUCCESS! Order created with inline customer orgNumber");

  // Test 2: POST /order with product: { number } instead of { id }
  console.log("\n--- Test 2: product by number ---");
  const t2 = await api("POST", "/order", {
    customer: { id: cust.id },
    orderDate: today,
    deliveryDate: today,
    orderLines: [
      { product: { number: prods[0].number }, description: "Test inline product", count: 1, unitPriceExcludingVatCurrency: 100 }
    ]
  });
  if (t2.ok) console.log("  SUCCESS! Order created with inline product number");

  // Test 3: Both customer by orgNumber AND product by number
  console.log("\n--- Test 3: both inline ---");
  const t3 = await api("POST", "/order", {
    customer: { organizationNumber: cust.organizationNumber },
    orderDate: today,
    deliveryDate: today,
    orderLines: [
      { product: { number: prods[0].number }, description: "Test both inline", count: 1, unitPriceExcludingVatCurrency: 100 }
    ]
  });
  if (t3.ok) console.log("  SUCCESS! Order created with both inline");
}

main().catch(e => { console.error(e); process.exit(1); });
