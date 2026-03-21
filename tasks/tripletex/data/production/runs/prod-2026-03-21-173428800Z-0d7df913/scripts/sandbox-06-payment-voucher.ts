const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Get payment voucher 609065848 with full postings
const url = `${BASE}/ledger/voucher/609065848?fields=*,postings(*,account(*))`;
console.log("GET", url);
const res = await fetch(url, { headers: { Authorization: AUTH } });
const data = await res.json();
console.log("Status:", res.status);

const v = data.value;
console.log(`\nVoucher ${v.id} (number=${v.number}, date=${v.date}):`);
console.log(`Description: ${v.description}`);
console.log(`\nPostings:`);
for (const p of (v.postings || [])) {
  console.log(`  Account ${p.account?.number} (${p.account?.name}) | AmountGross: ${p.amountGross} | AmountCurrency: ${p.amountCurrency} | Currency: ${p.currency?.code || '-'}`);
}

// Also check the invoice creation voucher 609065842
const url2 = `${BASE}/ledger/voucher/609065842?fields=*,postings(*,account(*))`;
console.log("\n\nGET", url2);
const res2 = await fetch(url2, { headers: { Authorization: AUTH } });
const data2 = await res2.json();
const v2 = data2.value;
console.log(`\nInvoice voucher ${v2?.id} (number=${v2?.number}, date=${v2?.date}):`);
console.log(`Description: ${v2?.description}`);
for (const p of (v2?.postings || [])) {
  console.log(`  Account ${p.account?.number} (${p.account?.name}) | AmountGross: ${p.amountGross} | AmountCurrency: ${p.amountCurrency}`);
}
