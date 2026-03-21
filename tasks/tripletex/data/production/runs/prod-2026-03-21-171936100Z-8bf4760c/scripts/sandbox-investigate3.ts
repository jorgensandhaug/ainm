// Verify: Do posting dates differ from voucher date in the combined voucher?
// Voucher 609057796 had date 2026-01-27 but postings had dates 2026-01-27, 2026-01-30, 2026-02-01

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

// Read back the combined voucher
const voucher = await api("GET", "/ledger/voucher/609057796?fields=*,postings(*)");
if (voucher?.value) {
  const v = voucher.value;
  console.log(`\nVoucher date: ${v.date}`);
  console.log(`Voucher description: ${v.description}`);
  console.log(`Postings (${v.postings?.length || 0}):`);
  for (const p of v.postings || []) {
    console.log(`  row=${p.row} date=${p.date} account=${p.account?.id} amount=${p.amountGross || p.amount} supplier=${p.supplier?.id || 'none'}`);
  }
}

// Also test: What happens with a combined voucher where posting dates differ more significantly?
// Does the voucher enforce a single date on all postings?
const accountRes = await api("GET", "/ledger/account?number=2400,1920&fields=id,number");
const accounts = accountRes?.values || [];
const acc2400 = accounts.find((a: any) => a.number === 2400);
const acc1920 = accounts.find((a: any) => a.number === 1920);

const supplierRes = await api("GET", "/supplier?count=3&fields=id,name");
const suppliers = supplierRes?.values || [];

// Test separate vouchers but only 1 call each (baseline comparison)
// Already proven: 1 combined voucher = 1 call for N supplier payments
// But does date preservation matter for scoring?

// Let's also see if open supplier postings are created correctly with the combined voucher
const sup1 = suppliers[0];
const openPosts = await api("GET", `/ledger/posting/openPost?date=2031-01-01&supplierId=${sup1.id}&count=100&fields=*,account(*)`);
console.log(`\nOpen postings for supplier ${sup1.id} (${sup1.name}): ${openPosts?.values?.length || 0}`);
for (const p of (openPosts?.values || []).slice(0, 5)) {
  console.log(`  posting ${p.id}: date=${p.date} amount=${p.amount} amountCurrency=${p.amountCurrency} account=${p.account?.number}`);
}
