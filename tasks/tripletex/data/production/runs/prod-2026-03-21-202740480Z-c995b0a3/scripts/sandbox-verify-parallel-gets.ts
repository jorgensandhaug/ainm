const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const HEADERS = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: HEADERS };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json();
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) {
    console.error(JSON.stringify(json, null, 2));
    throw new Error(`${method} ${path} failed: ${res.status}`);
  }
  return json;
}

async function main() {
  // Sandbox products have large numbers — use count=1000 to find usable ones
  const prodAll = await api("GET", "/product?count=1000&fields=*");
  const products = prodAll.values;
  console.log(`\n=== All ${products.length} products ===`);
  for (const p of products) {
    console.log(`  id=${p.id} number=${p.number} name=${p.name}`);
  }

  // Pick two products with smaller numeric numbers (fit in int32)
  const smallProducts = products.filter((p: any) => {
    const n = parseInt(String(p.number), 10);
    return !isNaN(n) && n > 0 && n < 2147483647;
  });
  console.log(`\nProducts with int32-valid numbers: ${smallProducts.length}`);
  for (const p of smallProducts) {
    console.log(`  id=${p.id} number=${p.number} name=${p.name}`);
  }

  if (smallProducts.length < 2) {
    console.log("Not enough products with small numbers. Creating test products...");
    const p1 = await api("POST", "/product", {
      name: "Sandbox Maintenance Test",
      number: 6293,
      priceExcludingVatCurrency: 21700,
    });
    const p2 = await api("POST", "/product", {
      name: "Sandbox Software License Test",
      number: 5849,
      priceExcludingVatCurrency: 2250,
    });
    console.log(`Created product 1: id=${p1.value.id} number=${p1.value.number}`);
    console.log(`Created product 2: id=${p2.value.id} number=${p2.value.number}`);
  }

  // Find a customer with org number
  const custAll = await api("GET", "/customer?count=100&fields=*");
  const custWithOrg = custAll.values.filter((c: any) => c.organizationNumber && c.organizationNumber.length > 0);
  console.log(`\nCustomers with org numbers: ${custWithOrg.length}`);
  for (const c of custWithOrg) {
    console.log(`  id=${c.id} org=${c.organizationNumber} name=${c.name}`);
  }

  // Test parallel GETs with the production product numbers (6293, 5849) if they exist
  console.log("\n=== Testing number=6293,5849 comma-separated ===");
  try {
    const r = await api("GET", "/product?number=6293,5849&fields=*");
    console.log(`Found: ${r.values.length} products`);
    for (const p of r.values) {
      console.log(`  id=${p.id} number=${p.number} name=${p.name}`);
    }
  } catch (e) {
    console.log("Comma-separated lookup for 6293,5849 failed (products may not exist)");
  }

  // Test: parallel 3 GETs with a valid customer
  if (custWithOrg.length > 0) {
    const testCust = custWithOrg[0];
    console.log(`\n=== Parallel 3 GETs for customer org=${testCust.organizationNumber} ===`);
    const t0 = Date.now();
    const [cR, pR, ptR] = await Promise.all([
      api("GET", `/customer?organizationNumber=${testCust.organizationNumber}&fields=*`),
      api("GET", "/product?count=1000&fields=*"),
      api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)"),
    ]);
    const t1 = Date.now();
    console.log(`Parallel took ${t1 - t0}ms`);
    console.log(`Customer: ${cR.values[0]?.name}`);
    console.log(`Products: ${pR.values.length}`);
    console.log(`PaymentTypes: ${ptR.values.length}`);

    const incomingPt = ptR.values.find((pt: any) => pt.debitAccount?.isBankAccount);
    console.log(`Incoming payment type: ${incomingPt?.description} (id=${incomingPt?.id})`);

    // Now sequential for comparison
    const t2 = Date.now();
    await api("GET", `/customer?organizationNumber=${testCust.organizationNumber}&fields=*`);
    await api("GET", "/product?count=1000&fields=*");
    await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
    const t3 = Date.now();
    console.log(`\nSequential took ${t3 - t2}ms`);
    console.log(`Time saved: ${(t3 - t2) - (t1 - t0)}ms`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
