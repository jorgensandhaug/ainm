const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "riTzIVXIWpa_XEGt0KQcrQjEgF_Oayv8-dF_D1TWt-8";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = new Date().toISOString().slice(0, 10);
const TOMORROW = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

const PROMPT_EUR_AMOUNT = 8387;
const ORIGINAL_RATE = 11.99;
const SETTLEMENT_RATE = 12.84;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log("ERROR:", JSON.stringify(json).slice(0, 500)); throw new Error(`${r.status}`); }
  return json;
}

async function main() {
  // Call 1: Locate the invoice
  const invRes = await api("GET", `/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=${TOMORROW}&fields=*,currency(*)`);
  const invoices = invRes.values || [];

  // Try EUR invoice first
  let invoice = invoices.find((i: any) =>
    i.currency?.code !== "NOK" &&
    i.amountCurrencyOutstanding > 0 &&
    Math.abs(i.amountExcludingVatCurrency - PROMPT_EUR_AMOUNT) < 1
  );

  const isEur = !!invoice;

  if (!invoice) {
    // NOK fallback: find invoice matching amountExcludingVat
    invoice = invoices.find((i: any) =>
      i.amountOutstanding > 0 &&
      Math.abs(i.amountExcludingVat - PROMPT_EUR_AMOUNT) < 1
    );
  }

  if (!invoice) {
    console.log("No matching invoice found");
    console.log("All invoices:", invoices.map((i: any) => ({
      id: i.id,
      curr: i.currency?.code,
      amtExVat: i.amountExcludingVat,
      amtExVatCurr: i.amountExcludingVatCurrency,
      outstanding: i.amountOutstanding,
      outstandingCurr: i.amountCurrencyOutstanding,
      amt: i.amount,
      amtCurr: i.amountCurrency,
    })));
    return;
  }

  console.log(`Found invoice ${invoice.id}, isEur=${isEur}, currency=${invoice.currency?.code}, amountOutstanding=${invoice.amountOutstanding}, amountCurrencyOutstanding=${invoice.amountCurrencyOutstanding}`);

  // Call 2: Resolve payment type
  const ptRes = await api("GET", `/invoice/paymentType?fields=*,debitAccount(*)`);
  const paymentTypes = ptRes.values || [];

  let pt = paymentTypes.find((p: any) =>
    p.debitAccount?.number >= 1900 && p.debitAccount?.number < 2000 && p.debitAccount?.isBankAccount === true
  );
  if (!pt) {
    pt = paymentTypes.find((p: any) =>
      p.debitAccount?.number >= 1900 && p.debitAccount?.number < 2000
    );
  }
  if (!pt) {
    pt = paymentTypes.find((p: any) =>
      p.description?.toLowerCase().includes("bank")
    );
  }

  if (!pt) { console.log("No bank payment type found"); return; }
  console.log(`Payment type: ${pt.id} (${pt.description}), debitAccount: ${pt.debitAccount?.number} (id=${pt.debitAccount?.id})`);

  if (isEur) {
    // EUR path: 3 calls total, auto-books FX
    const paidAmountCurrency = invoice.amountCurrencyOutstanding;
    const paidAmount = paidAmountCurrency * SETTLEMENT_RATE;
    const payRes = await api("PUT", `/invoice/${invoice.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${pt.id}&paidAmount=${paidAmount}&paidAmountCurrency=${paidAmountCurrency}`);
    console.log(`Payment done. amountOutstanding=${payRes.value?.amountOutstanding}, amountCurrencyOutstanding=${payRes.value?.amountCurrencyOutstanding}`);
  } else {
    // NOK fallback: 5 calls total, manual agio/disagio
    // Call 3: Register simple payment
    const payRes = await api("PUT", `/invoice/${invoice.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${pt.id}&paidAmount=${invoice.amountOutstanding}`);
    console.log(`Payment done. amountOutstanding=${payRes.value?.amountOutstanding}`);

    // Agio (settlement > original) or disagio (settlement < original)
    const isAgio = SETTLEMENT_RATE > ORIGINAL_RATE;
    const fxAmount = Math.round(PROMPT_EUR_AMOUNT * Math.abs(SETTLEMENT_RATE - ORIGINAL_RATE) * 100) / 100;
    const agioAcctNumber = isAgio ? 8060 : 8160;

    console.log(`FX type: ${isAgio ? "agio" : "disagio"}, amount: ${fxAmount}, account: ${agioAcctNumber}`);

    // Call 4: Resolve agio/disagio account ID
    const acctRes = await api("GET", `/ledger/account?number=${agioAcctNumber}&fields=id,number`);
    const agioAcct = (acctRes.values || [])[0];
    if (!agioAcct) { console.log(`Account ${agioAcctNumber} not found`); return; }

    const bankAcctId = pt.debitAccount.id;

    // Call 5: Book FX difference manually
    const postings = isAgio
      ? [
          { row: 1, date: TODAY, account: { id: bankAcctId }, amountGross: fxAmount, amountGrossCurrency: fxAmount, vatType: { id: 0 }, description: "Kursgevinst innbetaling" },
          { row: 2, date: TODAY, account: { id: agioAcct.id }, amountGross: -fxAmount, amountGrossCurrency: -fxAmount, vatType: { id: 0 }, description: "Valutagevinst (agio)" },
        ]
      : [
          { row: 1, date: TODAY, account: { id: agioAcct.id }, amountGross: fxAmount, amountGrossCurrency: fxAmount, vatType: { id: 0 }, description: "Valutatap (disagio)" },
          { row: 2, date: TODAY, account: { id: bankAcctId }, amountGross: -fxAmount, amountGrossCurrency: -fxAmount, vatType: { id: 0 }, description: "Kurstap innbetaling" },
        ];

    const voucherBody = {
      date: TODAY,
      description: isAgio ? "Valutagevinst (agio) - kursforskjell" : "Valutatap (disagio) - kursforskjell",
      postings,
    };

    const vRes = await api("POST", `/ledger/voucher?sendToLedger=true`, voucherBody);
    console.log(`Voucher created: ${vRes.value?.id}`);
  }

  console.log("DONE");
}

main().catch(e => { console.error(e); process.exit(1); });
