const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(BASE + path, { headers: H });
  const body = await r.json();
  console.log(`GET ${path} -> ${r.status}`);
  if (!r.ok) { console.log("  Error:", JSON.stringify(body)); return null; }
  return body;
}

async function main() {
  // Test comma-separated with small product numbers
  console.log("=== Test 1: comma-separated small numbers (7579,2292,6749) ===");
  const r1 = await get("/product?number=7579,2292,6749&fields=*");
  if (r1) {
    console.log("  Returned count:", r1.count);
    for (const p of r1.values || []) {
      console.log(`  #${p.number} id=${p.id} "${p.name}" vatType.id=${p.vatType?.id}`);
    }
  }

  // Test with 3 other small numbers
  console.log("\n=== Test 2: comma-separated (2109,1175,9974) ===");
  const r2 = await get("/product?number=2109,1175,9974&fields=*");
  if (r2) {
    console.log("  Returned count:", r2.count);
    for (const p of r2.values || []) {
      console.log(`  #${p.number} id=${p.id} "${p.name}" vatType.id=${p.vatType?.id}`);
    }
  }

  // Test with customer that has org number
  console.log("\n=== Test 3: customer by org number ===");
  const custResp = await get("/customer?organizationNumber=889752963&fields=*");
  if (custResp) {
    console.log("  Returned count:", custResp.count);
    for (const c of custResp.values || []) {
      console.log(`  id=${c.id} "${c.name}" org=${c.organizationNumber}`);
    }
  }

  // Now do a full 3-call invoice flow analog
  if (r2 && r2.count >= 3 && custResp && custResp.count > 0) {
    console.log("\n=== Test 4: Full 3-call invoice creation ===");
    const cust = custResp.values[0];
    const prods = r2.values;
    const byNum: Record<string, any> = {};
    for (const p of prods) byNum[String(p.number)] = p;

    const payload = {
      invoiceDate: "2026-03-21",
      invoiceDueDate: "2026-04-04",
      customer: { id: cust.id },
      orders: [{
        customer: { id: cust.id },
        orderDate: "2026-03-21",
        deliveryDate: "2026-03-21",
        orderLines: [
          {
            product: { id: byNum["2109"].id },
            description: "Mantenimiento",
            count: 1,
            unitPriceExcludingVatCurrency: 19250,
            vatType: { id: byNum["2109"].vatType?.id }
          },
          {
            product: { id: byNum["1175"].id },
            description: "Horas de consultoría",
            count: 1,
            unitPriceExcludingVatCurrency: 10000,
            vatType: { id: byNum["1175"].vatType?.id }
          },
          {
            product: { id: byNum["9974"].id },
            description: "Informe de análisis",
            count: 1,
            unitPriceExcludingVatCurrency: 15800,
            vatType: { id: byNum["9974"].vatType?.id }
          }
        ]
      }]
    };

    const r = await fetch(BASE + "/invoice?sendToCustomer=false", {
      method: "POST",
      headers: H,
      body: JSON.stringify(payload)
    });
    const body = await r.json();
    console.log(`POST /invoice?sendToCustomer=false -> ${r.status}`);
    if (r.ok) {
      const inv = body.value;
      console.log("  Invoice id:", inv.id);
      console.log("  invoiceNumber:", inv.invoiceNumber);
      console.log("  amountExcludingVatCurrency:", inv.amountExcludingVatCurrency);
      console.log("  amountCurrency:", inv.amountCurrency);
    } else {
      console.log("  Error:", JSON.stringify(body));
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
