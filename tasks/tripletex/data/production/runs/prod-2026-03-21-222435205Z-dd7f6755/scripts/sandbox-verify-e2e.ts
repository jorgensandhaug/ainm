// Sandbox end-to-end verification of canonical 5-call path
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: h };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  const mark = r.ok ? "OK" : "FAIL";
  console.log(`[${mark}] ${method} ${path} => ${r.status}`);
  if (!r.ok) { console.error(JSON.stringify(json, null, 2)); throw new Error(`${r.status}`); }
  return json;
}

// Use sandbox products with small numbers: 7579 (Opplæring), 2292 (Webdesign)
// Step 1: GET customer (use first available)
const custResp = await api("GET", "/customer?count=1&fields=*");
const customer = custResp.values[0];
console.log(`  Customer: ${customer.id} "${customer.name}"`);

// Step 2: GET products via comma-separated number
const prodResp = await api("GET", "/product?number=7579,2292&fields=*");
console.log(`  Found: ${prodResp.values.length} products`);
const p1 = prodResp.values.find((p: any) => String(p.number) === "7579");
const p2 = prodResp.values.find((p: any) => String(p.number) === "2292");
if (!p1 || !p2) throw new Error("Product resolution failed");
console.log(`  P1: ${p1.id} "${p1.name}" P2: ${p2.id} "${p2.name}"`);

// Step 3: GET payment types
const ptResp = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
const pt = ptResp.values[0];
console.log(`  PaymentType: ${pt.id} "${pt.description}"`);

// Step 4: POST order
const orderResp = await api("POST", "/order", {
  customer: { id: customer.id },
  orderDate: "2026-03-21",
  deliveryDate: "2026-03-21",
  orderLines: [
    { product: { id: p1.id }, description: "Opplæring", count: 1, unitPriceExcludingVatCurrency: 5700 },
    { product: { id: p2.id }, description: "Webdesign", count: 1, unitPriceExcludingVatCurrency: 3850 },
  ],
});
console.log(`  Order: ${orderResp.value.id}`);

// Step 5: Combined invoice + payment
const invResp = await api(
  "PUT",
  `/order/${orderResp.value.id}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false&paymentTypeId=${pt.id}&paidAmount=0.01&paymentTypeIdRestAmount=${pt.id}`
);
const inv = invResp.value;
console.log(`  Invoice: ${inv.id} #${inv.invoiceNumber}`);
console.log(`  amountOutstanding=${inv.amountOutstanding} amountCurrencyOutstanding=${inv.amountCurrencyOutstanding}`);
console.log(inv.amountOutstanding === 0 ? "\nSUCCESS: 5-call path verified, fully paid" : "\nFAIL: outstanding != 0");
