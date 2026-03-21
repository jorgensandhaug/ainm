// Sandbox verification: confirm the 2-call credit note flow still works
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const DATE = "2026-03-21";
const RND = Math.random().toString(36).slice(2, 8);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`  -> ${res.status}`, typeof json === "object" ? JSON.stringify(json).slice(0, 500) : json);
  if (!res.ok) throw new Error(`${res.status}`);
  return json;
}

// --- Setup: create a fixture customer + invoice to credit ---
console.log("=== SETUP: Creating fixture customer ===");
const cust = await api("POST", "/customer", {
  name: `CreditTest ${RND} AS`,
  organizationNumber: "991882502",
  invoiceSendMethod: "MANUAL"
});
const custId = cust.value.id;
console.log("Customer id:", custId);

// Get a VAT type for the invoice line
console.log("=== SETUP: Get outgoing VAT type ===");
const vatTypes = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${DATE}&fields=*`);
const vat25 = (vatTypes.values || []).find((v: any) => v.percentage === 25);
console.log("VAT 25% id:", vat25?.id);

console.log("=== SETUP: Creating fixture invoice ===");
const inv = await api("POST", "/invoice?sendToCustomer=false", {
  invoiceDate: DATE,
  invoiceDueDate: "2026-04-21",
  customer: { id: custId },
  orders: [{
    customer: { id: custId },
    orderDate: DATE,
    deliveryDate: DATE,
    orderLines: [{
      description: "Opplæring",
      count: 1,
      unitPriceExcludingVatCurrency: 13100,
      vatType: vat25 ? { id: vat25.id } : undefined
    }]
  }]
});
const origInvId = inv.value.id;
console.log("Original invoice id:", origInvId, "amount:", inv.value.amountExcludingVatCurrency);

// --- Now test the 2-call credit note flow ---
console.log("\n=== SCORED FLOW: Step 1 - Locate invoice ===");
const invoices = await api("GET",
  "/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))"
);

const candidates = (invoices.values || []).filter((i: any) => {
  if (i.isCreditNote || i.isCredited) return false;
  if (i.customer?.organizationNumber !== "991882502") return false;
  if (i.amountExcludingVatCurrency !== 13100 && i.amountExcludingVat !== 13100) return false;
  const descs: string[] = [];
  for (const ol of i.orderLines || []) descs.push(ol.description);
  for (const o of i.orders || []) for (const ol of o.orderLines || []) descs.push(ol.description);
  return descs.includes("Opplæring");
});

console.log("Candidates found:", candidates.length);
if (candidates.length < 1) { console.error("No matching invoice found!"); process.exit(1); }

// Use the first match (our fixture)
const targetId = candidates[0].id;
console.log("Target invoice id:", targetId);

console.log("\n=== SCORED FLOW: Step 2 - Create credit note ===");
const cn = await api("PUT", `/invoice/${targetId}/:createCreditNote?date=${DATE}&sendToCustomer=false`);
console.log("Credit note result:", JSON.stringify({
  id: cn.value?.id,
  invoiceNumber: cn.value?.invoiceNumber,
  isCreditNote: cn.value?.isCreditNote,
  creditedInvoice: cn.value?.creditedInvoice,
  amountExcludingVatCurrency: cn.value?.amountExcludingVatCurrency
}));

console.log("\n=== DONE ===");
console.log("Setup calls: 3 (customer + vatType + invoice)");
console.log("Scored flow calls: 2 (locate + createCreditNote)");
console.log("Total scored calls would be: 2");
