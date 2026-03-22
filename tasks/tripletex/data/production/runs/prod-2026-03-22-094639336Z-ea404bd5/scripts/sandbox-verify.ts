// Sandbox verification: create a fixture invoice for org 989339028 / "Maintenance" / 19650 and credit it in 2 calls
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) {
    console.error(`${method} ${path} => ${res.status}`, JSON.stringify(data).slice(0, 500));
    throw new Error(`${method} ${path} failed: ${res.status}`);
  }
  return data;
}

// Step 0: Setup fixture
// Find or create a customer with org number close to 989339028
const custSearch = await api("GET", "/customer?organizationNumber=989339028&fields=*");
let customerId: number;
if (custSearch.values?.length > 0) {
  customerId = custSearch.values[0].id;
  console.log(`Found existing customer id=${customerId}`);
} else {
  const custCreate = await api("POST", "/customer", { name: "Ridgepoint Ltd", organizationNumber: "989339028" });
  customerId = custCreate.value.id;
  console.log(`Created customer id=${customerId}`);
}

// Create an order with "Maintenance" line at 19650
const order = await api("POST", "/order", {
  customer: { id: customerId },
  deliveryDate: "2026-03-22",
  orderDate: "2026-03-22",
  orderLines: [{ description: "Maintenance", count: 1, unitPriceExcludingVatCurrency: 19650, vatType: { id: 3 } }]
});
const orderId = order.value.id;
console.log(`Created order id=${orderId}`);

// Invoice the order
const inv = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=2026-03-22&sendToCustomer=false`);
const invoiceId = inv.value.id;
console.log(`Created invoice id=${invoiceId}`);

// Now test the 2-call production path
console.log("\n=== PRODUCTION PATH (2 calls) ===");

// Call 1: Locate
const search = await api("GET", "/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))");
const invoices = search.values || [];
console.log(`Call 1: GET /invoice returned ${invoices.length} invoices`);

const candidates = invoices.filter((inv: any) => {
  if (inv.isCreditNote || inv.isCredited) return false;
  if (inv.customer?.organizationNumber !== "989339028") return false;
  if (inv.amountExcludingVatCurrency !== 19650 && inv.amountExcludingVat !== 19650) return false;
  const olMatch = inv.orderLines?.some((ol: any) => ol.description === "Maintenance");
  const nestedMatch = inv.orders?.some((o: any) => o.orderLines?.some((ol: any) => ol.description === "Maintenance"));
  return olMatch || nestedMatch;
});

console.log(`Filtered to ${candidates.length} candidate(s)`);
const target = candidates.sort((a: any, b: any) => b.id - a.id)[0];
console.log(`Target invoice id=${target.id}, amount=${target.amountExcludingVatCurrency}`);

// Call 2: Credit note
const cn = await api("PUT", `/invoice/${target.id}/:createCreditNote?date=2026-03-22&sendToCustomer=false`);
console.log(`Call 2: Credit note created: id=${cn.value.id}, isCreditNote=${cn.value.isCreditNote}, creditedInvoice=${cn.value.creditedInvoice}`);

console.log("\n=== SANDBOX VERIFICATION PASSED: 2 calls, 0 errors ===");
