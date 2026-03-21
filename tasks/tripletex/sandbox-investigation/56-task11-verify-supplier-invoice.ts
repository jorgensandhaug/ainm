// Verify supplierInvoice objects for both approaches
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { Authorization: AUTH } });
  const json = await res.json();
  console.log(`${method} ${path} => ${res.status}`);
  return json;
}

async function main() {
  // Both vouchers from previous test run
  const voucherA = 609166693; // sendToLedger=false only
  const voucherB = 609166698; // sendToLedger=true (booked)

  // Search supplierInvoice with correct date range (invoiceDateTo is EXCLUSIVE)
  console.log("=== Search ALL supplier invoices from today (date range fix) ===");
  const all = await api("GET", "/supplierInvoice?invoiceDateFrom=2026-03-21&invoiceDateTo=2026-03-22&fields=*");
  console.log(`Total: ${all.fullResultSize}`);
  for (const si of (all.values || [])) {
    console.log(`\n  SI id=${si.id}:`);
    console.log(`    invoiceNumber="${si.invoiceNumber}"`);
    console.log(`    invoiceDate="${si.invoiceDate}"`);
    console.log(`    dueDate="${si.dueDate}"`);
    console.log(`    supplier: id=${si.supplier?.id} name="${si.supplier?.name}"`);
    console.log(`    amount=${si.amount}`);
    console.log(`    amountCurrency=${si.amountCurrency}`);
    console.log(`    amountExcludingVat=${si.amountExcludingVat}`);
    console.log(`    amountExcludingVatCurrency=${si.amountExcludingVatCurrency}`);
    console.log(`    isCreditNote=${si.isCreditNote}`);
    console.log(`    voucher: id=${si.voucher?.id} number=${si.voucher?.number}`);
    console.log(`    currency=${JSON.stringify(si.currency)}`);
    console.log(`    paymentTypeId=${si.paymentTypeId}`);
    console.log(`    ALL KEYS: ${Object.keys(si).join(", ")}`);
  }

  // Also try searching by voucher ID
  console.log("\n\n=== Search by voucher ID ===");
  for (const vid of [voucherA, voucherB]) {
    console.log(`\n--- Voucher ${vid} ---`);
    const res = await api("GET", `/supplierInvoice?voucherId=${vid}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*`);
    console.log(`  found: ${res.fullResultSize}`);
    for (const si of (res.values || [])) {
      console.log(`  SI id=${si.id} inv=${si.invoiceNumber} amount=${si.amount} voucher=${si.voucher?.id}`);
    }
  }

  // Try supplierInvoice/{id} directly - use the voucher IDs as potential SI IDs
  console.log("\n\n=== Try GET /supplierInvoice with broad search ===");
  const broad = await api("GET", "/supplierInvoice?invoiceDateFrom=2026-03-01&invoiceDateTo=2026-03-22&fields=id,invoiceNumber,invoiceDate,supplier(id,name),voucher(id,number),amount,amountCurrency,amountExcludingVat,isCreditNote&count=100");
  console.log(`Total SI objects: ${broad.fullResultSize}`);
  const recent = (broad.values || []).slice(-20);
  for (const si of recent) {
    console.log(`  SI id=${si.id} inv="${si.invoiceNumber}" date=${si.invoiceDate} supplier="${si.supplier?.name}" voucher=${si.voucher?.id}/${si.voucher?.number} amount=${si.amount} amtExVat=${si.amountExcludingVat}`);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
