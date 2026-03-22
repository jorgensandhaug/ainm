const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "-0M405SUjkni6Y_wO0eBIKtklRz_cDel-iVOoOaU50c";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const DATE = "2026-03-22";

const PROMPT_EUR = 11764;
const ORIG_RATE = 10.90;
const SETTLE_RATE = 11.19;
// Settlement > original → agio (gain) → account 8060
const IS_AGIO = SETTLE_RATE > ORIG_RATE;
const FX_ACCT = IS_AGIO ? 8060 : 8160;
const FX_AMOUNT = +(PROMPT_EUR * Math.abs(SETTLE_RATE - ORIG_RATE)).toFixed(2);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.error("ERROR:", JSON.stringify(json).slice(0, 500)); throw new Error(`${r.status}`); }
  return json;
}

async function main() {
  // Call 1: Locate invoice
  const inv = await api("GET", `/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23&fields=*,currency(*)`);
  const invoices = inv.values || [];

  // Try EUR invoice first
  let target = invoices.find((i: any) =>
    i.currency?.code !== "NOK" &&
    i.amountCurrencyOutstanding > 0 &&
    i.amount !== i.amountCurrency &&
    i.amountExcludingVatCurrency === PROMPT_EUR
  );

  let isNokFallback = false;

  if (!target) {
    // NOK fallback: find by amountExcludingVat
    target = invoices.find((i: any) =>
      i.amountOutstanding > 0 &&
      i.amountExcludingVat === PROMPT_EUR
    );
    if (!target) {
      // Also try matching amountCurrencyOutstanding or other fields
      target = invoices.find((i: any) =>
        i.amountOutstanding > 0 &&
        (i.amountExcludingVat === PROMPT_EUR || i.amountExcludingVatCurrency === PROMPT_EUR)
      );
    }
    if (!target) {
      console.error("No matching invoice found. All invoices:", JSON.stringify(invoices.map((i: any) => ({
        id: i.id, amount: i.amount, amountCurrency: i.amountCurrency,
        amountExcludingVat: i.amountExcludingVat, amountExcludingVatCurrency: i.amountExcludingVatCurrency,
        amountOutstanding: i.amountOutstanding, amountCurrencyOutstanding: i.amountCurrencyOutstanding,
        currency: i.currency?.code
      }))));
      throw new Error("No matching invoice");
    }
    isNokFallback = true;
    console.log("NOK fallback: invoice is company-currency");
  }

  console.log(`Invoice: id=${target.id}, amount=${target.amount}, amountCurrency=${target.amountCurrency}, outstanding=${target.amountOutstanding}, currOutstanding=${target.amountCurrencyOutstanding}, currency=${target.currency?.code}`);

  // Call 2: Payment type
  const ptRes = await api("GET", `/invoice/paymentType?fields=*,debitAccount(*)`);
  const pts = ptRes.values || [];
  let pt = pts.find((p: any) => p.debitAccount?.number >= 1900 && p.debitAccount?.number < 2000 && p.debitAccount?.isBankAccount === true);
  if (!pt) pt = pts.find((p: any) => p.debitAccount?.number >= 1900 && p.debitAccount?.number < 2000);
  if (!pt) pt = pts.find((p: any) => p.description?.toLowerCase().includes("bank"));
  if (!pt) throw new Error("No bank payment type found");
  console.log(`PaymentType: id=${pt.id}, desc=${pt.description}, debitAcct=${pt.debitAccount?.number}, debitAcctId=${pt.debitAccount?.id}`);

  const bankAcctId = pt.debitAccount.id;

  if (!isNokFallback) {
    // EUR path: Call 3 - payment with FX
    const paidAmountCurrency = target.amountCurrencyOutstanding;
    const paidAmount = +(paidAmountCurrency * SETTLE_RATE).toFixed(2);
    const payRes = await api("PUT", `/invoice/${target.id}/:payment?paymentDate=${DATE}&paymentTypeId=${pt.id}&paidAmount=${paidAmount}&paidAmountCurrency=${paidAmountCurrency}`);
    console.log(`Payment done. Outstanding: ${payRes.value?.amountCurrencyOutstanding}, ${payRes.value?.amountOutstanding}`);

    // Verify
    const verify = await api("GET", `/invoice/${target.id}?fields=*,currency(*),postings(*,voucher(*),account(*))`);
    console.log(`Verify: amountCurrencyOutstanding=${verify.value?.amountCurrencyOutstanding}, amountOutstanding=${verify.value?.amountOutstanding}`);
    const fxPosting = verify.value?.postings?.find((p: any) => p.account?.number === FX_ACCT);
    console.log(`FX posting on ${FX_ACCT}:`, fxPosting ? `amount=${fxPosting.amountGross}` : "NOT FOUND");
    console.log("EUR path complete. 3 calls.");
  } else {
    // NOK path: Call 3 - simple payment
    const payRes = await api("PUT", `/invoice/${target.id}/:payment?paymentDate=${DATE}&paymentTypeId=${pt.id}&paidAmount=${target.amountOutstanding}`);
    console.log(`Payment done. Outstanding: ${payRes.value?.amountOutstanding}`);

    // Call 4: Resolve agio/disagio account
    const acctRes = await api("GET", `/ledger/account?number=${FX_ACCT}&fields=id,number`);
    const fxAcct = acctRes.values?.[0];
    if (!fxAcct) throw new Error(`Account ${FX_ACCT} not found`);
    console.log(`FX account: id=${fxAcct.id}, number=${fxAcct.number}`);

    // Call 5: Manual agio voucher
    const voucherBody: any = {
      date: DATE,
      description: IS_AGIO ? "Valutagevinst (agio) - kursforskjell" : "Valutatap (disagio) - kursforskjell",
      postings: IS_AGIO ? [
        { row: 1, date: DATE, account: { id: bankAcctId }, amountGross: FX_AMOUNT, amountGrossCurrency: FX_AMOUNT, vatType: { id: 0 }, description: "Kursgevinst innbetaling" },
        { row: 2, date: DATE, account: { id: fxAcct.id }, amountGross: -FX_AMOUNT, amountGrossCurrency: -FX_AMOUNT, vatType: { id: 0 }, description: "Valutagevinst (agio)" }
      ] : [
        { row: 1, date: DATE, account: { id: fxAcct.id }, amountGross: FX_AMOUNT, amountGrossCurrency: FX_AMOUNT, vatType: { id: 0 }, description: "Valutatap (disagio)" },
        { row: 2, date: DATE, account: { id: bankAcctId }, amountGross: -FX_AMOUNT, amountGrossCurrency: -FX_AMOUNT, vatType: { id: 0 }, description: "Valutatap (disagio)" }
      ]
    };
    const vRes = await api("POST", `/ledger/voucher?sendToLedger=true`, voucherBody);
    console.log(`Voucher created: id=${vRes.value?.id}, number=${vRes.value?.number}`);

    // Verify voucher
    const vVerify = await api("GET", `/ledger/voucher/${vRes.value?.id}?fields=id,number,date,description,postings(row,account(number,name),amountGross,amountGrossCurrency)`);
    console.log("Voucher postings:", JSON.stringify(vVerify.value?.postings));

    console.log(`NOK fallback complete. 5 calls. FX amount: ${FX_AMOUNT} on account ${FX_ACCT}`);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
