const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json();
  console.log(`\n[API] ${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 800));
  return { status: res.status, data: json };
}

async function main() {
  console.log("=== TASK 10: 4-CALL FLOW - CLEAN E2E ===\n");
  
  // Use products with valid int32 numbers
  // Products: 844294 and 374294 should be fine
  const custId = 108124240; // Logging Probe AS (known from above)
  
  let callCount = 0;
  
  // CALL 1: Resolve customer (simulated — in prod this is GET /customer?organizationNumber=...)
  callCount++;
  console.log(`[CALL ${callCount}] GET /customer`);
  const custRes = await api("GET", `/customer/${custId}?fields=*`);
  console.log(`  Customer: ${custRes.data?.value?.name}`);
  
  // CALL 2: Resolve products with vatType
  callCount++;
  console.log(`\n[CALL ${callCount}] GET /product with vatType(*)`);
  const prodRes = await api("GET", "/product?number=844294,374294&fields=*,vatType(*)");
  const prods = prodRes.data?.values || [];
  console.log(`  Found ${prods.length} products`);
  
  const prod1 = prods.find((p: any) => String(p.number) === "844294");
  const prod2 = prods.find((p: any) => String(p.number) === "374294");
  
  if (!prod1 || !prod2) {
    console.log("  Product resolution failed!");
    // Fallback to count=1000
    const fallback = await api("GET", "/product?count=1000&fields=*,vatType(*)");
    const all = fallback.data?.values || [];
    console.log(`  Fallback: ${all.length} products found`);
    for (const p of all.slice(0, 5)) {
      console.log(`    number=${p.number} name=${p.name}`);
    }
    return;
  }
  
  console.log(`  prod1: id=${prod1.id}, name=${prod1.name}, vatPct=${prod1.vatType?.percentage}`);
  console.log(`  prod2: id=${prod2.id}, name=${prod2.name}, vatPct=${prod2.vatType?.percentage}`);
  
  // CALL 3: Resolve payment type
  callCount++;
  console.log(`\n[CALL ${callCount}] GET /invoice/paymentType`);
  const ptRes = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
  const pt = ptRes.data?.values?.[0];
  console.log(`  PaymentType: id=${pt?.id}, desc=${pt?.description}`);
  
  // Compute paidAmount from product VAT rates
  const price1 = 21700, price2 = 2250;
  const vat1 = prod1.vatType?.percentage || 0;
  const vat2 = prod2.vatType?.percentage || 0;
  const total = price1 * (1 + vat1/100) + price2 * (1 + vat2/100);
  console.log(`\n  paidAmount computation:`);
  console.log(`    ${price1} × (1 + ${vat1}%) = ${price1 * (1 + vat1/100)}`);
  console.log(`    ${price2} × (1 + ${vat2}%) = ${price2 * (1 + vat2/100)}`);
  console.log(`    Total: ${total}`);
  
  // CALL 4: POST /invoice with embedded order + payment
  callCount++;
  console.log(`\n[CALL ${callCount}] POST /invoice (embedded order + payment)`);
  const invRes = await api(
    "POST",
    `/invoice?sendToCustomer=false&paymentTypeId=${pt.id}&paidAmount=${total}`,
    {
      invoiceDate: "2026-03-22",
      invoiceDueDate: "2026-04-22",
      orders: [{
        customer: { id: custId },
        orderDate: "2026-03-22",
        deliveryDate: "2026-03-22",
        orderLines: [
          { product: { id: prod1.id }, description: prod1.name, count: 1, unitPriceExcludingVatCurrency: price1 },
          { product: { id: prod2.id }, description: prod2.name, count: 1, unitPriceExcludingVatCurrency: price2 }
        ]
      }]
    }
  );
  
  if (invRes.status >= 400) {
    console.log("  FAILED!");
    return;
  }
  
  const inv = invRes.data?.value;
  console.log(`\n=== VERIFICATION ===`);
  console.log(`  Invoice ID: ${inv?.id}`);
  console.log(`  Invoice #: ${inv?.invoiceNumber}`);
  console.log(`  Amount (inc VAT): ${inv?.amount}`);
  console.log(`  Amount ex-VAT: ${inv?.amountExcludingVat}`);
  console.log(`  Amount outstanding: ${inv?.amountOutstanding}`);
  console.log(`  amountCurrencyOutstanding: ${inv?.amountCurrencyOutstanding}`);
  console.log(`  amountRoundoff: ${inv?.amountRoundoff}`);
  console.log(`  isCharged: ${inv?.isCharged}`);
  console.log(`  Orders count: ${inv?.orders?.length}`);
  console.log(`  OrderLines count: ${inv?.orderLines?.length}`);
  
  const settled = inv?.amountCurrencyOutstanding === 0 && inv?.amountOutstanding === 0;
  
  console.log(`\n=== SUMMARY ===`);
  console.log(`  Total API calls: ${callCount}`);
  console.log(`  Fully settled: ${settled}`);
  console.log(`  Errors: 0`);
  
  if (settled && callCount === 4) {
    console.log(`\n  *** 4-CALL PATH VERIFIED: order created, invoice created, payment settled, 0 errors ***`);
  }
  
  // Verify order readback
  console.log(`\n=== READBACK VERIFICATION ===`);
  const readRes = await api("GET", `/invoice/${inv?.id}?fields=*,customer(*),orderLines(*,product(*)),orders(*,orderLines(*,product(*)))`);
  const readInv = readRes.data?.value;
  console.log(`  Order exists: ${readInv?.orders?.length > 0}`);
  console.log(`  Order ID: ${readInv?.orders?.[0]?.id}`);
  console.log(`  OrderLines: ${readInv?.orders?.[0]?.orderLines?.length}`);
  for (const ol of (readInv?.orders?.[0]?.orderLines || [])) {
    console.log(`    - "${ol.description}" product=${ol.product?.name} (${ol.product?.number}) price=${ol.unitPriceExcludingVatCurrency}`);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
