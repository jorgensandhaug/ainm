// Sandbox verification: confirm 2-call credit note path still works
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const DATE = "2026-03-22";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const res = await fetch(url, {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`HTTP ${res.status}:`, JSON.stringify(json).slice(0, 1000));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return json;
}

// Step 1: Create a fixture customer + order + invoice to credit
console.log("=== Setting up fixture ===");
const cust = await api("POST", "/customer", {
  name: "SandboxVerify CreditNote " + Date.now(),
  organizationNumber: "879581265",
  customerNumber: 90000 + Math.floor(Math.random() * 9000),
});
const custId = cust.value.id;
console.log("Customer id:", custId);

const order = await api("POST", "/order", {
  customer: { id: custId },
  deliveryDate: DATE,
  orderDate: DATE,
  orderLines: [{ description: "Conseil en données", count: 1, unitPriceExcludingVatCurrency: 23750, vatType: { id: 3 } }],
});
const orderId = order.value.id;
console.log("Order id:", orderId);

const inv = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=${DATE}&sendToCustomer=false`);
const invId = inv.value.id;
console.log("Invoice id:", invId);

// Step 2: Now test the 2-call path
console.log("\n=== Testing 2-call credit note path ===");

// Call 1: GET /invoice to locate
const invoices = await api("GET",
  `/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`
);

const candidates = (invoices.values || []).filter((i: any) => {
  if (i.isCreditNote || i.isCredited) return false;
  if (i.customer?.organizationNumber !== "879581265") return false;
  if (i.amountExcludingVatCurrency !== 23750 && i.amountExcludingVat !== 23750) return false;
  const descs = new Set<string>();
  (i.orderLines || []).forEach((l: any) => descs.add(l.description));
  (i.orders || []).forEach((o: any) => (o.orderLines || []).forEach((l: any) => descs.add(l.description)));
  return descs.has("Conseil en données");
});

console.log(`Found ${candidates.length} matching invoices`);
const target = candidates.sort((a: any, b: any) => b.id - a.id)[0];
console.log(`Target invoice: id=${target.id} amount=${target.amountExcludingVatCurrency}`);

// Call 2: PUT createCreditNote
const cn = await api("PUT", `/invoice/${target.id}/:createCreditNote?date=${DATE}&sendToCustomer=false`);
const cnv = cn.value;
console.log(`\nCredit note: id=${cnv.id} number=${cnv.invoiceNumber} isCreditNote=${cnv.isCreditNote} creditedInvoice=${cnv.creditedInvoice}`);

// Verify
const verify = await api("GET", `/invoice/${cnv.id}?fields=id,invoiceNumber,isCreditNote,creditedInvoice,amountCurrency,amountExcludingVatCurrency,customer(id,name,organizationNumber)`);
console.log("\nVerification:", JSON.stringify(verify.value, null, 2));

const origCheck = await api("GET", `/invoice/${target.id}?fields=id,invoiceNumber,isCredited`);
console.log("Original now isCredited:", origCheck.value.isCredited);

console.log("\n=== SANDBOX VERIFICATION PASSED ===");
