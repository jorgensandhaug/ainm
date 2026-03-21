const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  console.log(`\n${method} ${url}`);
  const res = await fetch(url, { headers: { Authorization: AUTH } });
  const data = await res.json();
  console.log("Status:", res.status);
  return data;
}

// Look at the invoice payment details
const inv = await api("GET", "/invoice/2147617859?fields=*,currency(*),voucher(*),payments(*)");
console.log("Invoice payments field:", JSON.stringify(inv?.value?.payments, null, 2));
console.log("Invoice voucher:", JSON.stringify(inv?.value?.voucher, null, 2));

// Get recent vouchers to find the payment voucher
const vouchers = await api("GET", "/ledger/voucher?dateFrom=2026-03-21&dateTo=2026-03-21&fields=*,postings(*,account(*))&count=20&sorting=id&order=desc");
if (vouchers?.values) {
  console.log(`\n=== Recent vouchers (${vouchers.values.length}) ===`);
  for (const v of vouchers.values.slice(0, 5)) {
    console.log(`\nVoucher ${v.id} (number=${v.number}, type=${v.typeId}):`);
    for (const p of (v.postings || [])) {
      console.log(`  Account ${p.account?.number} (${p.account?.name}) | AmountGross: ${p.amountGross} | AmountCurrency: ${p.amountCurrency} | Currency: ${p.currency?.code || 'NOK'}`);
    }
  }
}
