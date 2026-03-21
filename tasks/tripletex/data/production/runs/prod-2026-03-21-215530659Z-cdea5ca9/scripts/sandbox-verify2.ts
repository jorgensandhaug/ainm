const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Authorization": AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}/${path}`;
  console.log(`GET ${url}`);
  const r = await fetch(url, { headers: H });
  const body = await r.text();
  console.log(`  -> ${r.status}`);
  if (!r.ok) { console.log(body); }
  return { status: r.status, data: r.ok ? JSON.parse(body) : body };
}

async function post(path: string, data: any) {
  const url = `${BASE}/${path}`;
  console.log(`POST ${url}`);
  const r = await fetch(url, { method: "POST", headers: H, body: JSON.stringify(data) });
  const body = await r.text();
  console.log(`  -> ${r.status}`);
  if (!r.ok) { console.log(body); }
  return { status: r.status, data: r.ok ? JSON.parse(body) : body };
}

async function main() {
  // Use existing sandbox products with small numeric numbers
  // 2109 "Mantenimiento", 1175 "Horas de consultoría", 9974 "Informe de análisis"

  // Step 1: Try comma-separated number query with small integers
  console.log("=== Test 1: Comma-separated number query with small integers ===");
  const prodRes = await get("product?number=2109,1175,9974&fields=*");
  if (prodRes.status === 200) {
    const prods = prodRes.data.values;
    console.log(`  Returned ${prods.length} products:`);
    for (const p of prods) {
      console.log(`    id=${p.id} number=${p.number} name="${p.name}" vatType.id=${p.vatType?.id}`);
    }
  }

  // Step 2: Get a customer to use
  console.log("\n=== Test 2: Get existing customer ===");
  const custRes = await get("customer?count=3&fields=*");
  if (custRes.status === 200) {
    const custs = custRes.data.values;
    console.log(`  Found ${custs.length} customers`);
    if (custs.length > 0) {
      const cust = custs[0];
      console.log(`  Using: id=${cust.id} name="${cust.name}" orgNumber=${cust.organizationNumber}`);

      // Step 3: Create invoice with the 3-call path analog
      if (prodRes.status === 200 && prodRes.data.values.length === 3) {
        const prods = prodRes.data.values;
        const byNum: Record<string, any> = {};
        for (const p of prods) byNum[String(p.number)] = p;

        const p1 = byNum["2109"];
        const p2 = byNum["1175"];
        const p3 = byNum["9974"];

        if (p1 && p2 && p3) {
          console.log("\n=== Test 3: Create invoice (3-call path analog) ===");
          const today = "2026-03-21";
          const invoice = {
            invoiceDate: today,
            invoiceDueDate: today,
            customer: { id: cust.id },
            orders: [{
              orderDate: today,
              deliveryDate: today,
              customer: { id: cust.id },
              orderLines: [
                {
                  product: { id: p1.id },
                  description: p1.name,
                  count: 1,
                  unitPriceExcludingVatCurrency: 3650,
                  vatType: { id: p1.vatType?.id },
                },
                {
                  product: { id: p2.id },
                  description: p2.name,
                  count: 1,
                  unitPriceExcludingVatCurrency: 11000,
                  vatType: { id: p2.vatType?.id },
                },
                {
                  product: { id: p3.id },
                  description: p3.name,
                  count: 1,
                  unitPriceExcludingVatCurrency: 17700,
                  vatType: { id: p3.vatType?.id },
                },
              ],
            }],
          };

          const invoiceRes = await post("invoice?sendToCustomer=false", invoice);
          if (invoiceRes.status === 201) {
            const inv = invoiceRes.data.value;
            console.log(`  Invoice created: id=${inv.id} number=${inv.invoiceNumber}`);
            console.log(`  amountExcludingVatCurrency=${inv.amountExcludingVatCurrency}`);
            console.log(`  amountCurrency=${inv.amountCurrency}`);
            console.log(`  Expected excl VAT: ${3650 + 11000 + 17700} = 32350`);
            console.log(`  Sandbox only has 0% VAT, so amountCurrency should also be 32350`);

            // Readback for verification
            console.log("\n=== Readback ===");
            const readback = await get(`invoice/${inv.id}?fields=*,orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))`);
            if (readback.status === 200) {
              const rb = readback.data.value;
              console.log(`  Invoice id=${rb.id}, number=${rb.invoiceNumber}`);
              console.log(`  amountExcludingVatCurrency=${rb.amountExcludingVatCurrency}`);
              console.log(`  amountCurrency=${rb.amountCurrency}`);
              const lines = rb.invoiceLines || rb.orderLines || [];
              console.log(`  Lines (${lines.length}):`);
              for (const l of lines) {
                console.log(`    product=${l.product?.number || l.product?.id} desc="${l.description}" price=${l.unitPriceExcludingVatCurrency} vatType.id=${l.vatType?.id} vatType.pct=${l.vatType?.percentage}`);
              }
            }
          }
        }
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
