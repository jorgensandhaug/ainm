const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  console.log(`\n${method} ${url}`);
  const res = await fetch(url, { headers: { Authorization: AUTH } });
  const data = await res.json();
  console.log("Status:", res.status);
  if (res.status >= 400) console.log("Error:", JSON.stringify(data, null, 2));
  return data;
}

// Try to get all vouchers from today
const vouchers = await api("GET", "/ledger/voucher?dateFrom=2026-03-21&dateTo=2026-03-22&count=10&sorting=-id&fields=id,number,date,description");
console.log("Vouchers:", JSON.stringify(vouchers?.values?.slice(0, 10), null, 2));

// Try just the last few voucher IDs near our invoice voucher 609065842
for (const vid of [609065843, 609065844, 609065845]) {
  const v = await api("GET", `/ledger/voucher/${vid}?fields=*,postings(*,account(*))`);
  if (v?.value) {
    console.log(`\nVoucher ${vid}:`);
    for (const p of (v.value.postings || [])) {
      console.log(`  Account ${p.account?.number} (${p.account?.name}) | AmountGross: ${p.amountGross} | AmountCurrency: ${p.amountCurrency}`);
    }
  }
}
