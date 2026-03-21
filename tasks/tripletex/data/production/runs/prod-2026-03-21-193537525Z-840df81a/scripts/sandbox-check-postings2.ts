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
  // 8060 postings
  console.log("=== 8060 postings ===");
  const agio = await api("GET", `/ledger/posting?accountNumberFrom=8060&accountNumberTo=8060&dateFrom=2026-01-01&dateTo=2026-12-31&fields=id,amount,amountCurrency,description,date,voucher(id,number,description)&count=50`);
  if (agio?.values) {
    for (const p of agio.values) {
      console.log(`  date=${p.date} voucher=${p.voucher?.number} amount=${p.amount} desc=${p.description}`);
    }
  }

  // 8160 postings
  console.log("\n=== 8160 postings ===");
  const disagio = await api("GET", `/ledger/posting?accountNumberFrom=8160&accountNumberTo=8160&dateFrom=2026-01-01&dateTo=2026-12-31&fields=id,amount,amountCurrency,description,date,voucher(id,number,description)&count=50`);
  if (disagio?.values) {
    for (const p of disagio.values) {
      console.log(`  date=${p.date} voucher=${p.voucher?.number} voucherId=${p.voucher?.id} amount=${p.amount} desc=${p.description}`);
    }
  }

  // Get the full voucher postings for the most recent disagio
  if (disagio?.values?.length) {
    const lastDisagio = disagio.values[disagio.values.length - 1];
    const vid = lastDisagio.voucher?.id;
    console.log(`\n=== Full postings for disagio voucher ${vid} ===`);
    const postings = await api("GET", `/ledger/posting?voucherId=${vid}&dateFrom=2026-01-01&dateTo=2026-12-31&fields=*,account(id,number)`);
    if (postings?.values) {
      for (const p of postings.values) {
        console.log(`  acct=${p.account?.number} amount=${p.amount} amountCurrency=${p.amountCurrency} desc=${p.description}`);
      }
    }
  }
}

main().catch(console.error);
