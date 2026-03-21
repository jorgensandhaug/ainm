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
  // We have EUR invoice 2147608712:
  // amountCurrency=2052 EUR, amount=23178.37 NOK, outstanding=2052 EUR / 23178.37 NOK
  // Task: pay at 10.01 NOK/EUR
  // paidAmountCurrency = 2052 (EUR outstanding)
  // paidAmount = 2052 * 10.01 = 20540.52 (NOK at settlement rate)

  // Use existing payment type from sandbox: "Betalt til bank" id 32813748 (from previous proofs)
  // Let's first verify payment types
  console.log("=== PAYMENT TYPES ===");
  const ptRes = await api("GET", "/invoice/paymentType?fields=*,debitAccount(*)");
  let paymentTypeId: number | null = null;
  if (ptRes.data?.values) {
    for (const p of ptRes.data.values) {
      console.log(JSON.stringify({
        id: p.id, description: p.description, name: p.name,
        currencyCode: p.currencyCode,
        debitAccount: p.debitAccount ? { number: p.debitAccount.number, name: p.debitAccount.name, isBankAccount: p.debitAccount.isBankAccount } : null
      }));
      // Pick bank payment type with 19xx debit account
      if (p.debitAccount?.number >= 1900 && p.debitAccount?.number < 2000) {
        paymentTypeId = p.id;
      }
    }
  }
  if (!paymentTypeId) { console.log("No suitable payment type found"); return; }
  console.log(`\nUsing payment type ${paymentTypeId}`);

  // Pay the EUR invoice at rate 10.01
  const paidAmountCurrency = 2052;  // EUR outstanding
  const paidAmount = 2052 * 10.01;  // = 20540.52 NOK

  console.log(`\n=== PAY EUR INVOICE 2147608712 ===`);
  console.log(`paidAmountCurrency=${paidAmountCurrency} EUR, paidAmount=${paidAmount} NOK`);

  const payRes = await api("PUT",
    `/invoice/2147608712/:payment?paymentDate=2026-03-21&paymentTypeId=${paymentTypeId}&paidAmount=${paidAmount}&paidAmountCurrency=${paidAmountCurrency}`
  );

  if (payRes.data?.value) {
    const inv = payRes.data.value;
    console.log(`\nPost-payment state:`);
    console.log(`  amountOutstanding: ${inv.amountOutstanding}`);
    console.log(`  amountCurrencyOutstanding: ${inv.amountCurrencyOutstanding}`);
    console.log(`  postings count: ${inv.postings?.length}`);

    // Check the payment voucher postings for disagio
    if (inv.postings?.length > 0) {
      const lastPosting = inv.postings[inv.postings.length - 1];
      console.log(`  Last posting id: ${lastPosting.id}`);
    }
  }

  // Check the postings on today's date to see the disagio
  console.log("\n=== TODAY'S POSTINGS (to check disagio) ===");
  const postRes = await api("GET", "/ledger/posting?dateFrom=2026-03-21&dateTo=2026-03-22&count=100&fields=*,account(*),voucher(*)");
  if (postRes.data?.values) {
    // Filter for recent postings related to this invoice
    const recent = postRes.data.values.filter((p: any) => {
      // Look for postings on accounts 1500 (AR), 1920 (bank), 8160 (disagio)
      const accNum = p.account?.number;
      return accNum === 1500 || accNum === 1920 || accNum === 8160 || accNum === 8060;
    });
    console.log(`Found ${recent.length} relevant postings (accounts 1500/1920/8160/8060):`);
    for (const p of recent) {
      console.log(JSON.stringify({
        id: p.id,
        amount: p.amount, amountGross: p.amountGross, amountCurrency: p.amountCurrency, amountGrossCurrency: p.amountGrossCurrency,
        account: { number: p.account?.number, name: p.account?.name },
        voucher: { id: p.voucher?.id, description: p.voucher?.description },
        description: p.description
      }));
    }

    // Show ALL postings for complete picture
    console.log(`\nAll ${postRes.data.values.length} postings today:`);
    for (const p of postRes.data.values) {
      console.log(JSON.stringify({
        id: p.id, amount: p.amount, amountGross: p.amountGross,
        account: p.account?.number, description: p.description?.substring(0, 50),
        voucherId: p.voucher?.id
      }));
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
