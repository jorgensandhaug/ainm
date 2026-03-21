const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

// Read voucher 426 (id 609153461) and verify postings
const r = await fetch(`${BASE}/ledger/voucher/609153461?fields=*,postings(*)`, { headers: h });
const body = await r.json();
const v = body.value;
console.log(`Voucher #${v.number} date=${v.date} desc="${v.description}"`);
console.log("\nPostings:");
for (const p of v.postings.sort((a: any, b: any) => a.row - b.row)) {
  console.log(`  row=${p.row} date=${p.date} acct=${p.account?.id} desc="${p.description}" amountGross=${p.amountGross} supplier=${p.supplier?.id || 'none'}`);
}

// Also check one of the paid invoices
const invR = await fetch(`${BASE}/invoice/2147638319?fields=*`, { headers: h });
const inv = await invR.json();
console.log(`\nInvoice #${inv.value.invoiceNumber}: outstanding=${inv.value.amountOutstanding} paid=${inv.value.amountPaid} status=${inv.value.invoicesDueIn || 'N/A'}`);
