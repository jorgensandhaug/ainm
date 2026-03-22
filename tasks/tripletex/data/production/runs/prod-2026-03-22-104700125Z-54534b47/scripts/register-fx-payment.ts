const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "O6DiaK1ZXIp5zNQdNOJ391_lRDyeTDg4QzUXu-m-E8o";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";

const PROMPT_EUR = 7045;
const ORIGINAL_RATE = 11.32;
const SETTLEMENT_RATE = 11.99;
// Settlement > original → agio (gain) → account 8060
const IS_AGIO = SETTLEMENT_RATE > ORIGINAL_RATE;
const AGIO_ACCOUNT = IS_AGIO ? 8060 : 8160;
const FX_AMOUNT = +(PROMPT_EUR * Math.abs(SETTLEMENT_RATE - ORIGINAL_RATE)).toFixed(2);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) {
    console.error("ERROR:", JSON.stringify(json, null, 2));
    throw new Error(`${method} ${path} failed: ${res.status}`);
  }
  return json;
}

async function main() {
  // Call 1: Locate the invoice
  const invoices = await api("GET", `/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23&fields=*,currency(*)`);
  const allInv = invoices.values || [];
  console.log(`Total invoices: ${allInv.length}`);

  // Try EUR invoice first
  let inv = allInv.find((i: any) =>
    i.currency?.code !== "NOK" &&
    i.amountCurrencyOutstanding > 0 &&
    i.amount !== i.amountCurrency &&
    i.amountExcludingVatCurrency === PROMPT_EUR
  );

  const isEUR = !!inv;

  if (!inv) {
    // NOK fallback: match by amountExcludingVat
    inv = allInv.find((i: any) =>
      i.amountOutstanding > 0 &&
      i.amountExcludingVat === PROMPT_EUR
    );
  }

  if (!inv) {
    // Broader: try matching any outstanding invoice
    console.log("Outstanding invoices:", allInv.filter((i: any) => i.amountOutstanding > 0 || i.amountCurrencyOutstanding > 0).map((i: any) => ({
      id: i.id, amount: i.amount, amountCurrency: i.amountCurrency, exVat: i.amountExcludingVat, exVatCurrency: i.amountExcludingVatCurrency, outstanding: i.amountOutstanding, outstandingCurrency: i.amountCurrencyOutstanding, currency: i.currency?.code
    })));
    throw new Error("No matching invoice found");
  }

  console.log(`Found invoice: id=${inv.id}, currency=${inv.currency?.code}, amount=${inv.amount}, amountCurrency=${inv.amountCurrency}, outstanding=${inv.amountOutstanding}, outstandingCurrency=${inv.amountCurrencyOutstanding}, isEUR=${isEUR}`);

  // Call 2: Resolve payment type
  const ptRes = await api("GET", `/invoice/paymentType?fields=*,debitAccount(*)`);
  const pts = ptRes.values || [];
  let pt = pts.find((p: any) => p.debitAccount?.number >= 1900 && p.debitAccount?.number < 2000 && p.debitAccount?.isBankAccount === true);
  if (!pt) pt = pts.find((p: any) => p.debitAccount?.number >= 1900 && p.debitAccount?.number < 2000);
  if (!pt) pt = pts.find((p: any) => p.description?.toLowerCase().includes("bank"));
  if (!pt) throw new Error("No bank payment type found");
  console.log(`Payment type: id=${pt.id}, desc="${pt.description}", debitAccount=${pt.debitAccount?.number} (id=${pt.debitAccount?.id})`);

  const bankAccountId = pt.debitAccount.id;

  if (isEUR) {
    // EUR path: payment auto-books FX
    const paidAmount = +(inv.amountCurrencyOutstanding * SETTLEMENT_RATE).toFixed(2);
    const payRes = await api("PUT", `/invoice/${inv.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${pt.id}&paidAmount=${paidAmount}&paidAmountCurrency=${inv.amountCurrencyOutstanding}`);
    console.log(`Payment result: outstandingCurrency=${payRes.value?.amountCurrencyOutstanding}, outstanding=${payRes.value?.amountOutstanding}`);
    console.log("EUR path: FX auto-booked by Tripletex. Done. 3 calls.");

    // Verify
    const verify = await api("GET", `/invoice/${inv.id}?fields=*,currency(*)`);
    console.log(`Verify: amountCurrencyOutstanding=${verify.value?.amountCurrencyOutstanding}, amountOutstanding=${verify.value?.amountOutstanding}`);
  } else {
    // NOK fallback: simple payment + manual agio voucher
    console.log("NOK fallback path. Using simple payment + manual agio voucher.");

    // Call 3: Simple payment
    const payRes = await api("PUT", `/invoice/${inv.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${pt.id}&paidAmount=${inv.amountOutstanding}`);
    console.log(`Payment result: outstanding=${payRes.value?.amountOutstanding}`);

    // Call 4: Resolve agio/disagio account ID
    const acctRes = await api("GET", `/ledger/account?number=${AGIO_ACCOUNT}&fields=id,number`);
    const agioAcct = (acctRes.values || [])[0];
    if (!agioAcct) throw new Error(`Account ${AGIO_ACCOUNT} not found`);
    console.log(`Agio account: id=${agioAcct.id}, number=${agioAcct.number}`);

    // Call 5: Manual agio voucher
    console.log(`FX amount: ${PROMPT_EUR} × |${SETTLEMENT_RATE} - ${ORIGINAL_RATE}| = ${PROMPT_EUR} × ${Math.abs(SETTLEMENT_RATE - ORIGINAL_RATE).toFixed(2)} = ${FX_AMOUNT} NOK`);

    const postings = IS_AGIO
      ? [
          { row: 1, date: TODAY, account: { id: bankAccountId }, amountGross: FX_AMOUNT, amountGrossCurrency: FX_AMOUNT, vatType: { id: 0 }, description: "Kursgevinst innbetaling" },
          { row: 2, date: TODAY, account: { id: agioAcct.id }, amountGross: -FX_AMOUNT, amountGrossCurrency: -FX_AMOUNT, vatType: { id: 0 }, description: "Valutagevinst (agio)" },
        ]
      : [
          { row: 1, date: TODAY, account: { id: agioAcct.id }, amountGross: FX_AMOUNT, amountGrossCurrency: FX_AMOUNT, vatType: { id: 0 }, description: "Valutatap (disagio)" },
          { row: 2, date: TODAY, account: { id: bankAccountId }, amountGross: -FX_AMOUNT, amountGrossCurrency: -FX_AMOUNT, vatType: { id: 0 }, description: "Kurstap innbetaling" },
        ];

    const voucherRes = await api("POST", `/ledger/voucher?sendToLedger=true`, {
      date: TODAY,
      description: IS_AGIO ? "Valutagevinst (agio) - kursforskjell" : "Valutatap (disagio) - kursforskjell",
      postings,
    });
    console.log(`Voucher created: id=${voucherRes.value?.id}, number=${voucherRes.value?.number}`);
    console.log("NOK fallback path done. 5 calls.");

    // Verify payment
    const verify = await api("GET", `/invoice/${inv.id}?fields=*,currency(*)`);
    console.log(`Verify payment: amountOutstanding=${verify.value?.amountOutstanding}`);

    // Verify voucher
    if (voucherRes.value?.id) {
      const vv = await api("GET", `/ledger/voucher/${voucherRes.value.id}?fields=id,number,date,description,postings(row,account(number,name),amountGross,amountGrossCurrency)`);
      console.log(`Verify voucher:`, JSON.stringify(vv.value, null, 2));
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
