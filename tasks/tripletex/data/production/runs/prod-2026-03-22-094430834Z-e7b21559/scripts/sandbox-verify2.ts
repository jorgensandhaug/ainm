const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const DATE = "2026-03-22";

const ORG = "910441930";
const DESC = "Rapport d'analyse";
const AMOUNT = 6150;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} -> ${res.status}`);
  if (!res.ok) { console.log("ERROR:", JSON.stringify(json).slice(0, 500)); }
  return { status: res.status, data: json };
}

async function run() {
  // Setup: create customer (use unique name to avoid collision with prior run)
  const custRes = await api("POST", "/customer", {
    name: "Océan SARL SB2",
    organizationNumber: ORG,
    isCustomer: true,
  });
  // May fail if org already exists, try to find existing
  let custId = custRes.data?.value?.id;
  if (!custId) {
    const findRes = await api("GET", `/customer?organizationNumber=${ORG}&fields=id`);
    custId = findRes.data?.values?.[0]?.id;
  }
  console.log("Customer id:", custId);

  // Setup: create order with correct pricing field
  const orderRes = await api("POST", "/order", {
    customer: { id: custId },
    deliveryDate: DATE,
    orderDate: DATE,
    orderLines: [{ description: DESC, count: 1, unitPriceExcludingVatCurrency: AMOUNT, vatType: { id: 3 } }],
  });
  const orderId = orderRes.data?.value?.id;
  console.log("Order id:", orderId);

  // Setup: create invoice from order
  const invRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=${DATE}&sendToCustomer=false`, {});
  const invoiceId = invRes.data?.value?.id;
  console.log("Invoice id:", invoiceId);

  // Check the invoice amount
  const checkRes = await api("GET", `/invoice/${invoiceId}?fields=amountExcludingVatCurrency,amountExcludingVat`);
  console.log("Invoice amount:", checkRes.data?.value?.amountExcludingVatCurrency);

  // Now simulate the production 2-call path:
  console.log("\n=== PRODUCTION 2-CALL PATH ===");

  // Call 1: Locate
  const getRes = await api("GET", `/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`);
  const invoices = getRes.data?.values || [];
  const candidates = invoices.filter((inv: any) => {
    if (inv.isCreditNote || inv.isCredited) return false;
    if (inv.customer?.organizationNumber !== ORG) return false;
    if (inv.amountExcludingVatCurrency !== AMOUNT && inv.amountExcludingVat !== AMOUNT) return false;
    const olDescs = (inv.orderLines || []).map((ol: any) => ol.description);
    const nestedDescs = (inv.orders || []).flatMap((o: any) => (o.orderLines || []).map((ol: any) => ol.description));
    return [...olDescs, ...nestedDescs].some((d: string) => d === DESC);
  });
  console.log(`Candidates found: ${candidates.length}`);
  if (candidates.length === 0) { console.error("No match!"); process.exit(1); }
  const target = candidates.reduce((a: any, b: any) => (a.id > b.id ? a : b));
  console.log(`Target invoice id=${target.id}`);

  // Call 2: Create credit note
  const cnRes = await api("PUT", `/invoice/${target.id}/:createCreditNote?date=${DATE}&sendToCustomer=false`);
  const v = cnRes.data?.value;
  console.log(`Credit note: id=${v?.id}, isCreditNote=${v?.isCreditNote}, creditedInvoice=${v?.creditedInvoice}`);

  if (v?.isCreditNote && v?.creditedInvoice === target.id) {
    console.log("\nSANDBOX VERIFICATION PASSED: 2-call path works for this prompt shape");
  } else {
    console.error("\nSANDBOX VERIFICATION FAILED");
    process.exit(1);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
