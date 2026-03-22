// Sandbox verification: credit note for "Asesoría de datos" shape
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const DATE = "2026-03-22";
const RND = Math.floor(Math.random() * 100000);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (res.status === 204) { console.log("204 No Content"); return null; }
  const json = await res.json();
  if (!res.ok) { console.error("ERROR", res.status, JSON.stringify(json).slice(0, 500)); process.exit(1); }
  return json;
}

// 1. Create fixture customer
const custRes = await api("POST", "/customer", {
  name: `Sandbox CreditNote ${RND} AS`,
  organizationNumber: `80${String(RND).padStart(7, "0").slice(0, 7)}`,
  isCustomer: true
});
const custId = custRes.value.id;
const custOrgNr = custRes.value.organizationNumber;
console.log(`Created customer id=${custId} orgNr=${custOrgNr}`);

// 2. Create fixture order + invoice
const orderRes = await api("POST", "/order", {
  customer: { id: custId },
  deliveryDate: DATE,
  orderDate: DATE,
  orderLines: [{ description: "Asesoría de datos", count: 1, unitPriceExcludingVatCurrency: 8550, vatType: { id: 3 } }]
});
const orderId = orderRes.value.id;
console.log(`Created order id=${orderId}`);

// 3. Invoice the order
const invRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=${DATE}&sendToCustomer=false`);
const invoiceId = invRes.value.id;
console.log(`Created invoice id=${invoiceId}`);

// ---- Now test the 2-call credit note path ----

// Step 1: Locate invoice (same as production)
const locateRes = await api("GET",
  `/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`
);

const invoices = (locateRes.values || []).filter((inv: any) => {
  if (inv.isCreditNote || inv.isCredited) return false;
  if (inv.customer?.organizationNumber !== custOrgNr) return false;
  if (inv.amountExcludingVatCurrency !== 8550 && inv.amountExcludingVat !== 8550) return false;
  const olDescs = (inv.orderLines || []).map((ol: any) => ol.description);
  const nestedDescs = (inv.orders || []).flatMap((o: any) => (o.orderLines || []).map((ol: any) => ol.description));
  const allDescs = [...olDescs, ...nestedDescs];
  return allDescs.some((d: string) => d === "Asesoría de datos");
});

if (invoices.length === 0) { console.error("No matching invoice found in sandbox"); process.exit(1); }
const target = invoices.reduce((a: any, b: any) => (a.id > b.id ? a : b));
console.log(`Located invoice id=${target.id} number=${target.invoiceNumber} amountExVat=${target.amountExcludingVatCurrency}`);

// Step 2: Create credit note (same as production)
const cnRes = await api("PUT", `/invoice/${target.id}/:createCreditNote?date=${DATE}&sendToCustomer=false`);
const cn = cnRes.value;
console.log(`\n=== CREDIT NOTE RESULT ===`);
console.log(`id=${cn.id} number=${cn.invoiceNumber}`);
console.log(`isCreditNote=${cn.isCreditNote}`);
console.log(`creditedInvoice=${cn.creditedInvoice}`);
console.log(`amountExcludingVatCurrency=${cn.amountExcludingVatCurrency}`);
console.log(`amountCurrency=${cn.amountCurrency}`);
console.log(`\n=== SANDBOX VERIFICATION PASSED ===`);
console.log(`2-call path confirmed for organizationNumber=${custOrgNr}, description="Asesoría de datos", amountExcludingVatCurrency=8550`);
