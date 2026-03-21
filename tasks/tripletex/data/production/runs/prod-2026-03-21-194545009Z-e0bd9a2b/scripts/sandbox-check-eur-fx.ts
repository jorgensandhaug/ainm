const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string): Promise<any> {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { headers });
  const body = await r.json();
  if (!r.ok) throw new Error(`GET failed ${r.status}`);
  return body;
}

async function main() {
  // Check the EUR invoice I created: ID=2147631555
  // Get the invoice details
  const invRes = await get(`/invoice/2147631555?fields=*,currency(*),voucher(*)`);
  const inv = invRes.value;
  console.log("=== EUR Invoice 2147631555 ===");
  console.log(`currency: ${inv.currency?.code}`);
  console.log(`amount (NOK): ${inv.amount}`);
  console.log(`amountCurrency (EUR): ${inv.amountCurrency}`);
  console.log(`amountExcludingVat (NOK): ${inv.amountExcludingVat}`);
  console.log(`amountExcludingVatCurrency (EUR): ${inv.amountExcludingVatCurrency}`);
  console.log(`amountOutstanding: ${inv.amountOutstanding}`);
  console.log(`amountCurrencyOutstanding: ${inv.amountCurrencyOutstanding}`);
  console.log(`Invoice voucher: ${inv.voucher?.id}`);

  // Original rate = amount / amountCurrency = 143328.6 / 12689
  const originalRate = inv.amount / inv.amountCurrency;
  console.log(`\nOriginal rate: ${originalRate} NOK/EUR`);
  console.log(`Settlement rate: 10.71 NOK/EUR`);
  console.log(`Expected disagio: ${inv.amountCurrency} * (${originalRate} - 10.71) = ${inv.amountCurrency * (originalRate - 10.71)}`);
  console.log(`Or: amount - paidAmount = ${inv.amount} - ${inv.amountCurrency * 10.71} = ${inv.amount - inv.amountCurrency * 10.71}`);

  // Now find the payment voucher (different from invoice voucher)
  // Get all postings for this invoice
  // Look for recent vouchers with 8160 or 8060 postings
  const postRes = await get(`/ledger/posting?dateFrom=2026-03-20&dateTo=2026-03-22&fields=*,account(*),voucher(*)&count=200`);
  const postings = postRes.values || [];
  console.log(`\nTotal postings found: ${postings.length}`);

  // Find FX-related postings (8060 or 8160)
  const fxPostings = postings.filter((p: any) => p.account?.number === 8160 || p.account?.number === 8060);
  console.log(`\nFX postings (8060/8160):`);
  for (const p of fxPostings) {
    console.log(`  Voucher ${p.voucher?.id}: account=${p.account?.number} (${p.account?.name}), amount=${p.amount}, amountCurrency=${p.amountCurrency}`);
  }

  // Find the specific payment voucher for invoice 2147631555
  // The payment voucher should reference 1500 (kundefordringer) and 1920 (bank)
  // Let me look at postings that reference 1500 with the right amounts
  const arPostings = postings.filter((p: any) => p.account?.number === 1500);
  console.log(`\n1500 (Kundefordringer) postings:`);
  for (const p of arPostings.slice(-10)) {
    console.log(`  Voucher ${p.voucher?.id}: amount=${p.amount}, amountCurrency=${p.amountCurrency}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
