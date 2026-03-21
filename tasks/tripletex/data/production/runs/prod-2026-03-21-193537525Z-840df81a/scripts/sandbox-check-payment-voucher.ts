// Check the payment voucher postings from the EUR invoice payment
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method, headers: { Authorization: AUTH } });
  const text = await res.text();
  if (!res.ok) { console.log(`ERROR ${res.status}: ${text.substring(0, 200)}`); return null; }
  return JSON.parse(text);
}

async function main() {
  // Get vouchers from today (dateTo exclusive = tomorrow)
  console.log("=== Recent vouchers ===");
  const vRes = await api("GET", `/ledger/voucher?dateFrom=2026-03-21&dateTo=2026-03-22&fields=id,number,description&count=20`);
  if (vRes?.values) {
    for (const v of vRes.values.slice(-10)) {
      console.log(`\nVoucher id=${v.id} num=${v.number}: ${v.description}`);
      const pRes = await api("GET", `/ledger/posting?voucherId=${v.id}&fields=*,account(id,number)`);
      if (pRes?.values) {
        for (const p of pRes.values) {
          console.log(`  acct=${p.account?.number} amount=${p.amount} amountCurrency=${p.amountCurrency} desc=${p.description}`);
        }
      }
    }
  }

  // Also check: what's the invoice 2147631702 details again, and what was the booked rate?
  const inv = (await api("GET", `/invoice/2147631702?fields=*,currency(*)`))?.value;
  if (inv) {
    console.log(`\n=== Invoice 2147631702 ===`);
    console.log(`currency=${inv.currency?.code} factor=${inv.currency?.factor}`);
    console.log(`amountExcludingVat=${inv.amountExcludingVat} amountExcludingVatCurrency=${inv.amountExcludingVatCurrency}`);
    console.log(`amount=${inv.amount} amountCurrency=${inv.amountCurrency}`);
    console.log(`booked rate: ${inv.amount / inv.amountCurrency}`);
  }
}

main().catch(console.error);
