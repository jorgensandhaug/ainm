const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { headers: h });
  const body = await r.json();
  return body;
}

// Fire 5 reads in parallel per trusted standard
const [invoices, paymentTypes, suppliers, supplierInvoices, accounts] = await Promise.all([
  get("/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,customer(*)"),
  get("/invoice/paymentType?count=1000&fields=*,debitAccount(*)"),
  get("/supplier?count=1000&fields=*"),
  get("/supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,supplier(*)"),
  get("/ledger/account?number=1920,2400,2600,7770,8050&fields=*"),
]);

console.log("=== INVOICES ===");
for (const inv of (invoices as any).values || []) {
  console.log(`Invoice #${inv.invoiceNumber} id=${inv.id} customer="${inv.customer?.name}" outstanding=${inv.amountOutstanding} currOutstanding=${inv.amountCurrencyOutstanding} total=${inv.amount}`);
}

console.log("\n=== PAYMENT TYPES ===");
for (const pt of (paymentTypes as any).values || []) {
  console.log(`PaymentType id=${pt.id} desc="${pt.description}" debitAcct=${pt.debitAccount?.number}`);
}

console.log("\n=== SUPPLIERS ===");
for (const s of (suppliers as any).values || []) {
  console.log(`Supplier id=${s.id} name="${s.name}"`);
}

console.log("\n=== SUPPLIER INVOICES ===");
console.log(`Count: ${(supplierInvoices as any).fullResultSize || 0}`);
for (const si of (supplierInvoices as any).values || []) {
  console.log(`SupplierInvoice id=${si.id} supplier="${si.supplier?.name}" amount=${si.amount}`);
}

console.log("\n=== ACCOUNTS ===");
for (const a of (accounts as any).values || []) {
  console.log(`Account id=${a.id} number=${a.number} name="${a.name}"`);
}
