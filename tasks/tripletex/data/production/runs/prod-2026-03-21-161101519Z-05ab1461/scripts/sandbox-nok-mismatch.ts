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
  const custId = 108373993;
  const paymentTypeId = 32813748;

  // Create a NOK order (no currency specification → defaults to NOK)
  console.log("=== CREATE NOK ORDER ===");
  const orderRes = await api("POST", "/order", {
    customer: { id: custId },
    orderDate: "2026-02-15",
    deliveryDate: "2026-02-15",
    orderLines: [{
      description: "NOK mismatch test",
      count: 1,
      unitPriceExcludingVatCurrency: 2565
    }]
  });
  const orderId = orderRes.data?.value?.id;
  if (!orderId) { console.log("Failed"); return; }

  // Invoice it
  console.log("=== INVOICE ===");
  const invRes = await api("PUT", `/order/${orderId}/:invoice?sendToCustomer=false&invoiceDate=2026-02-15`);
  const invoiceId = invRes.data?.value?.id;
  if (!invoiceId) { console.log("Failed"); return; }
  const inv = invRes.data.value;
  console.log(`Invoice ${invoiceId}:`);
  console.log(`  amount: ${inv.amount}, amountCurrency: ${inv.amountCurrency}`);
  console.log(`  outstanding: ${inv.amountOutstanding}, currOutstanding: ${inv.amountCurrencyOutstanding}`);
  console.log(`  currency: ${JSON.stringify(inv.currency)}`);

  // Now try the same thing the production agent did: paidAmount=25675, paidAmountCurrency=2565
  console.log("\n=== PAY WITH MISMATCHED AMOUNTS (like production) ===");
  console.log("  paidAmount=25675.65 (wrong - 10x), paidAmountCurrency=2565 (correct)");

  const payRes = await api("PUT",
    `/invoice/${invoiceId}/:payment?paymentDate=2026-03-21&paymentTypeId=${paymentTypeId}&paidAmount=25675.65&paidAmountCurrency=2565`
  );

  if (payRes.data?.value) {
    const p = payRes.data.value;
    console.log(`\nPost-payment:`);
    console.log(`  amountOutstanding: ${p.amountOutstanding}`);
    console.log(`  amountCurrencyOutstanding: ${p.amountCurrencyOutstanding}`);
    console.log(`  postings: ${JSON.stringify(p.postings?.map((x: any) => x.id))}`);
  }

  // Check the voucher postings to see what Tripletex did
  if (payRes.data?.value?.postings) {
    console.log("\n=== PAYMENT VOUCHER POSTINGS ===");
    for (const pRef of payRes.data.value.postings) {
      const postRes = await api("GET", `/ledger/posting/${pRef.id}?fields=*,account(*),voucher(*)`);
      if (postRes.data?.value) {
        const p = postRes.data.value;
        console.log(`  ${p.id}: acct=${p.account?.number} (${p.account?.name}), amt=${p.amount}, amtCurr=${p.amountCurrency}`);
      }
    }
  }

  // Also try: what if we just pay a NOK invoice with ONLY paidAmount=2565 (no paidAmountCurrency)?
  // Create another NOK invoice for comparison
  console.log("\n\n=== NOW TEST CORRECT NOK PAYMENT ===");
  const order2Res = await api("POST", "/order", {
    customer: { id: custId },
    orderDate: "2026-02-20",
    deliveryDate: "2026-02-20",
    orderLines: [{
      description: "NOK correct test",
      count: 1,
      unitPriceExcludingVatCurrency: 500
    }]
  });
  const order2Id = order2Res.data?.value?.id;
  if (!order2Id) return;

  const inv2Res = await api("PUT", `/order/${order2Id}/:invoice?sendToCustomer=false&invoiceDate=2026-02-20`);
  const invoice2Id = inv2Res.data?.value?.id;
  if (!invoice2Id) return;
  console.log(`Invoice ${invoice2Id}: outstanding=${inv2Res.data.value.amountOutstanding}`);

  // Pay correctly with just paidAmount
  const pay2Res = await api("PUT",
    `/invoice/${invoice2Id}/:payment?paymentDate=2026-03-21&paymentTypeId=${paymentTypeId}&paidAmount=500`
  );
  if (pay2Res.data?.value) {
    console.log(`Post-payment: outstanding=${pay2Res.data.value.amountOutstanding}, currOutstanding=${pay2Res.data.value.amountCurrencyOutstanding}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
