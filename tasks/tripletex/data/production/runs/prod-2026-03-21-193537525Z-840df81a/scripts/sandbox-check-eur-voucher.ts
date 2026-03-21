// Examine the auto-generated FX postings on a paid EUR invoice
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: { Authorization: AUTH },
  };
  const res = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) {
    console.log(`${method} ${path.substring(0, 60)} -> ${res.status} ERROR`);
    return null;
  }
  return JSON.parse(text);
}

async function main() {
  // Check all postings on account 8060 (agio) and 8160 (disagio)
  console.log("=== All 8060 postings (from auto-generated EUR payments) ===");
  const agio = await api("GET", `/ledger/posting?accountNumberFrom=8060&accountNumberTo=8060&dateFrom=2000-01-01&dateTo=2026-12-31&fields=*,account(id,number),voucher(id,number,description)`);
  if (agio?.values) {
    for (const p of agio.values) {
      console.log(`  voucherId=${p.voucherId} voucherNum=${p.voucher?.number} amount=${p.amount} desc=${p.description || p.voucher?.description}`);
    }
  }

  console.log("\n=== All 8160 postings ===");
  const disagio = await api("GET", `/ledger/posting?accountNumberFrom=8160&accountNumberTo=8160&dateFrom=2000-01-01&dateTo=2026-12-31&fields=*,account(id,number),voucher(id,number,description)`);
  if (disagio?.values) {
    for (const p of disagio.values) {
      console.log(`  voucherId=${p.voucherId} voucherNum=${p.voucher?.number} amount=${p.amount} desc=${p.description || p.voucher?.description}`);
    }
  }

  // Now get the full postings for one of those vouchers to see the complete structure
  if (agio?.values?.length > 0) {
    const voucherId = agio.values[0].voucherId;
    console.log(`\n=== Full postings for voucher ${voucherId} (agio voucher) ===`);
    const vPostings = await api("GET", `/ledger/posting?voucherId=${voucherId}&fields=*,account(id,number)`);
    if (vPostings?.values) {
      for (const p of vPostings.values) {
        console.log(`  account=${p.account?.number} (id=${p.account?.id}) amount=${p.amount} amountCurrency=${p.amountCurrency} desc=${p.description}`);
      }
    }
  }

  if (disagio?.values?.length > 0) {
    const voucherId = disagio.values[0].voucherId;
    console.log(`\n=== Full postings for voucher ${voucherId} (disagio voucher) ===`);
    const vPostings = await api("GET", `/ledger/posting?voucherId=${voucherId}&fields=*,account(id,number)`);
    if (vPostings?.values) {
      for (const p of vPostings.values) {
        console.log(`  account=${p.account?.number} (id=${p.account?.id}) amount=${p.amount} amountCurrency=${p.amountCurrency} desc=${p.description}`);
      }
    }
  }
}

main().catch(console.error);
