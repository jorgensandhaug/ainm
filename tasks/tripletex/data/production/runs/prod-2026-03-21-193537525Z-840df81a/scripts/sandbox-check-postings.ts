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
  // Check ALL postings on account 8060 and 8160 (all time) to find the auto-generated agio from EUR payment
  console.log("=== 8060 postings (all time) ===");
  const agio = await api("GET", `/ledger/posting?accountNumberFrom=8060&accountNumberTo=8060&dateFrom=2026-01-01&dateTo=2026-12-31&fields=id,amount,amountCurrency,description,date,voucherId&count=50`);
  if (agio?.values) {
    for (const p of agio.values) {
      console.log(`  id=${p.id} date=${p.date} voucherId=${p.voucherId} amount=${p.amount} desc=${p.description}`);
    }
  }

  console.log("\n=== 8160 postings (all time) ===");
  const disagio = await api("GET", `/ledger/posting?accountNumberFrom=8160&accountNumberTo=8160&dateFrom=2026-01-01&dateTo=2026-12-31&fields=id,amount,amountCurrency,description,date,voucherId&count=50`);
  if (disagio?.values) {
    for (const p of disagio.values) {
      console.log(`  id=${p.id} date=${p.date} voucherId=${p.voucherId} amount=${p.amount} desc=${p.description}`);
    }
  }

  // Now check specific voucher postings for the most recent disagio voucher
  // Invoice 2147631702 was paid and booked rate 11.2955 > settlement rate 10.87, so disagio
  if (disagio?.values?.length) {
    const lastDisagio = disagio.values[disagio.values.length - 1];
    console.log(`\n=== Full postings for disagio voucher ${lastDisagio.voucherId} ===`);
    const postings = await api("GET", `/ledger/posting?voucherId=${lastDisagio.voucherId}&dateFrom=2026-01-01&dateTo=2026-12-31&fields=*,account(id,number)`);
    if (postings?.values) {
      for (const p of postings.values) {
        console.log(`  acct=${p.account?.number} amount=${p.amount} amountCurrency=${p.amountCurrency} desc=${p.description}`);
      }
    }
  }

  // Also get ALL postings for the latest agio voucher (our manual one from before)
  if (agio?.values?.length) {
    const lastAgio = agio.values[agio.values.length - 1];
    console.log(`\n=== Full postings for agio voucher ${lastAgio.voucherId} ===`);
    const postings = await api("GET", `/ledger/posting?voucherId=${lastAgio.voucherId}&dateFrom=2026-01-01&dateTo=2026-12-31&fields=*,account(id,number)`);
    if (postings?.values) {
      for (const p of postings.values) {
        console.log(`  acct=${p.account?.number} amount=${p.amount} amountCurrency=${p.amountCurrency} desc=${p.description}`);
      }
    }
  }
}

main().catch(console.error);
