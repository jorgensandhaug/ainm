const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string): Promise<any> {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { headers });
  const body = await r.json();
  if (!r.ok) throw new Error(`GET failed ${r.status}: ${JSON.stringify(body).substring(0, 300)}`);
  return body;
}

async function main() {
  // Find the payment-related vouchers for invoice 2147631555
  // The invoice voucher is 609120658
  // Let me look for vouchers right after 609120658

  // Get most recent vouchers by ID
  const vRes = await get(`/ledger/voucher?dateFrom=2026-03-21&dateTo=2026-03-22&count=50&sorting=id&fields=*`);
  const vouchers = vRes.values || [];
  console.log(`Vouchers near 609120658:`);
  for (const v of vouchers) {
    console.log(`  ID=${v.id}, type=${v.typeId}, date=${v.date}, desc="${v.description}", number=${v.number}`);
  }

  // For each voucher, get its postings
  for (const v of vouchers) {
    const vDetail = await get(`/ledger/voucher/${v.id}?fields=*,postings(*,account(*))`);
    const postings = vDetail.value?.postings || [];
    const hasFx = postings.some((p: any) => p.account?.number === 8160 || p.account?.number === 8060);
    const has1920 = postings.some((p: any) => p.account?.number === 1920);
    const has1500 = postings.some((p: any) => p.account?.number === 1500);

    if (hasFx || (has1920 && has1500)) {
      console.log(`\n=== Voucher ${v.id} (type=${v.typeId}, desc="${v.description}") ===`);
      for (const p of postings) {
        console.log(`  Row ${p.row}: ${p.account?.number} (${p.account?.name}) amount=${p.amount} amountCurrency=${p.amountCurrency}`);
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
