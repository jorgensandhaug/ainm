const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const res = await fetch(url, { headers: { Authorization: AUTH } });
  const text = await res.text();
  console.log(`Status: ${res.status}`);
  if (!res.ok) { console.log("Error:", text); return null; }
  return JSON.parse(text);
}

// Get voucher with postings expanded
const vRes = await api("GET", "/ledger/voucher/609081397?fields=*,postings(id,row,account(id,number,name),amount,amountCurrency,amountGross,amountGrossCurrency,description)");
if (vRes?.value) {
  const v = vRes.value;
  console.log(`\nVoucher ${v.id}: date=${v.date} desc=${v.description}`);
  for (const p of v.postings || []) {
    console.log(`  Row ${p.row}: Account ${p.account?.number} (${p.account?.name}) amount=${p.amount} amountGross=${p.amountGross}`);
  }
}

// Also check the payment voucher for the invoice we just paid (2147531841)
// Get the invoice to find its payment voucher
const invRes = await api("GET", "/invoice/2147531841?fields=*,voucher(*)");
if (invRes?.value) {
  console.log("\nInvoice voucher:", invRes.value.voucher?.id);
}

// Get postings for the payment date
const postRes = await api("GET", "/ledger/posting?dateFrom=2026-03-21&dateTo=2026-03-22&fields=*,account(id,number,name)&count=100");
if (postRes) {
  console.log("\nAll postings on 2026-03-21:");
  for (const p of postRes.values || []) {
    console.log(`  Voucher ${p.voucher?.id} Row ${p.row}: Account ${p.account?.number} (${p.account?.name}) amount=${p.amount}`);
  }
}
