// Sandbox investigation: Can we safely skip GET /supplierInvoice and always use manual voucher?
// Also: Can we fire all reads (including /ledger/account) in parallel from the start?
// Also: Do supplier invoices even exist in this sandbox?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method, headers });
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} -> ${r.status}`);
  if (!r.ok) {
    console.error("  ERROR:", JSON.stringify(data).slice(0, 300));
    return null;
  }
  return data;
}

// Check what exists in sandbox
const [invoices, suppliers, supplierInvoices, accounts, paymentTypes] = await Promise.all([
  api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,customer(*)"),
  api("GET", "/supplier?count=1000&fields=*"),
  api("GET", "/supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,supplier(*)"),
  api("GET", "/ledger/account?number=2400,1920&fields=*"),
  api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*)"),
]);

console.log("\n=== INVOICES ===");
const invs = invoices?.values || [];
console.log(`Count: ${invs.length}`);
for (const inv of invs.slice(0, 10)) {
  console.log(`  #${inv.invoiceNumber}: ${inv.customer?.name}, outstanding=${inv.amountOutstanding}, amountCurrencyOutstanding=${inv.amountCurrencyOutstanding}`);
}

console.log("\n=== SUPPLIERS ===");
const sups = suppliers?.values || [];
console.log(`Count: ${sups.length}`);
for (const s of sups.slice(0, 10)) {
  console.log(`  ${s.id}: ${s.name}`);
}

console.log("\n=== SUPPLIER INVOICES ===");
const supInvs = supplierInvoices?.values || [];
console.log(`Count: ${supInvs.length}`);
for (const si of supInvs.slice(0, 10)) {
  console.log(`  ${si.id}: supplier=${si.supplier?.name}, outstanding=${si.amountOutstanding}, amountCurrencyOutstanding=${si.amountCurrencyOutstanding}`);
}

console.log("\n=== ACCOUNTS ===");
const accs = accounts?.values || [];
for (const a of accs) {
  console.log(`  ${a.number} (id=${a.id}): ${a.name}`);
}

console.log("\n=== PAYMENT TYPES ===");
const pts = paymentTypes?.values || [];
for (const pt of pts.slice(0, 5)) {
  console.log(`  ${pt.id}: debitAccount=${pt.debitAccount?.number}, name=${pt.name}, isBankAccount=${pt.isBankAccount}`);
}

// Key question: If supplier invoices exist in sandbox, does the manual voucher approach
// still produce correct accounting? Or does it create duplicate postings?
if (supInvs.length > 0) {
  console.log("\n=== SUPPLIER INVOICES EXIST - test if manual voucher is safe alongside them ===");
  // Check open postings for one supplier
  const firstSup = supInvs[0];
  const openPosts = await api("GET", `/ledger/posting/openPost?date=2031-01-01&supplierId=${firstSup.supplier?.id}&count=100&fields=*`);
  console.log(`Open postings for supplier ${firstSup.supplier?.name}: ${openPosts?.values?.length || 0}`);
  for (const p of (openPosts?.values || []).slice(0, 5)) {
    console.log(`  posting ${p.id}: amount=${p.amount}, amountCurrency=${p.amountCurrency}, account=${p.account?.number}`);
  }
} else {
  console.log("\n=== NO SUPPLIER INVOICES in sandbox - manual voucher is the only path ===");
}
