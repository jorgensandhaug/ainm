const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`\n>>> ${method} ${url}`);
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`<<< ${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(data, null, 2)); }
  return { status: r.status, data };
}

async function main() {
  // Create fresh EUR order + invoice
  const EUR_ID = 5;
  const custId = 108373993; // already created
  const paymentTypeId = 32813748; // "Betalt til bank", debit 1920

  console.log("=== CREATE FRESH EUR ORDER ===");
  const orderRes = await api("POST", "/order", {
    customer: { id: custId },
    orderDate: "2026-02-01",
    deliveryDate: "2026-02-01",
    currency: { id: EUR_ID },
    orderLines: [{
      description: "Disagio test services",
      count: 1,
      unitPriceExcludingVatCurrency: 1000
    }]
  });
  const orderId = orderRes.data?.value?.id;
  if (!orderId) { console.log("Failed to create order"); return; }

  console.log("=== INVOICE IT ===");
  const invRes = await api("PUT", `/order/${orderId}/:invoice?sendToCustomer=false&invoiceDate=2026-02-01`);
  const invoiceId = invRes.data?.value?.id;
  if (!invoiceId) { console.log("Failed to create invoice"); return; }
  const inv = invRes.data.value;
  console.log(`Invoice ${invoiceId}:`);
  console.log(`  EUR amount (amountCurrency): ${inv.amountCurrency}`);
  console.log(`  NOK amount (amount): ${inv.amount}`);
  console.log(`  EUR outstanding: ${inv.amountCurrencyOutstanding}`);
  console.log(`  NOK outstanding: ${inv.amountOutstanding}`);
  const originalNokRate = inv.amount / inv.amountCurrency;
  console.log(`  Implicit rate: ${originalNokRate.toFixed(4)} NOK/EUR`);

  // Now pay at a LOWER rate (disagio scenario)
  // Original rate was ~11.3 NOK/EUR, settlement at 10.01 NOK/EUR
  const settlementRate = 10.01;
  const paidAmountCurrency = inv.amountCurrencyOutstanding; // Full EUR outstanding
  const paidAmount = paidAmountCurrency * settlementRate; // NOK at settlement rate

  console.log(`\n=== REGISTER PAYMENT ===`);
  console.log(`  paidAmountCurrency: ${paidAmountCurrency} EUR`);
  console.log(`  paidAmount: ${paidAmount} NOK (at ${settlementRate} NOK/EUR)`);
  console.log(`  FX difference: ${inv.amount - paidAmount} NOK (disagio)`);

  const payRes = await api("PUT",
    `/invoice/${invoiceId}/:payment?paymentDate=2026-03-21&paymentTypeId=${paymentTypeId}&paidAmount=${paidAmount}&paidAmountCurrency=${paidAmountCurrency}`
  );

  if (payRes.data?.value) {
    const paid = payRes.data.value;
    console.log(`\nPost-payment:`);
    console.log(`  amountOutstanding: ${paid.amountOutstanding}`);
    console.log(`  amountCurrencyOutstanding: ${paid.amountCurrencyOutstanding}`);
    console.log(`  postings: ${paid.postings?.length}`);
  }

  // Check postings for this invoice's vouchers
  console.log("\n=== CHECK VOUCHER POSTINGS FOR DISAGIO ===");
  if (payRes.data?.value?.postings) {
    for (const pRef of payRes.data.value.postings) {
      const postingRes = await api("GET", `/ledger/posting/${pRef.id}?fields=*,account(*),voucher(*)`);
      if (postingRes.data?.value) {
        const p = postingRes.data.value;
        console.log(`  Posting ${p.id}: account=${p.account?.number} (${p.account?.name}), amount=${p.amount}, amountCurrency=${p.amountCurrency}, voucherId=${p.voucher?.id}`);
      }
    }
  }

  // Also check if Tripletex auto-booked on 8160
  console.log("\n=== CHECK 8160 POSTINGS ===");
  const disagioRes = await api("GET", "/ledger/posting?dateFrom=2026-03-21&dateTo=2026-03-22&count=50&fields=*,account(*)&accountNumber=8160");
  if (disagioRes.status === 422) {
    // Try without accountNumber filter
    const postRes = await api("GET", "/ledger/posting?dateFrom=2026-03-21&dateTo=2026-03-22&count=200&fields=*,account(*)");
    if (postRes.data?.values) {
      const disagioPostings = postRes.data.values.filter((p: any) => p.account?.number === 8160);
      console.log(`Found ${disagioPostings.length} postings on account 8160 today:`);
      for (const p of disagioPostings) {
        console.log(`  ${p.id}: amount=${p.amount}, amountCurrency=${p.amountCurrency}, desc=${p.description?.substring(0, 80)}`);
      }
    }
  } else if (disagioRes.data?.values) {
    console.log(`Found ${disagioRes.data.values.length} postings on 8160:`);
    for (const p of disagioRes.data.values) {
      console.log(`  ${p.id}: amount=${p.amount}, desc=${p.description?.substring(0, 80)}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
