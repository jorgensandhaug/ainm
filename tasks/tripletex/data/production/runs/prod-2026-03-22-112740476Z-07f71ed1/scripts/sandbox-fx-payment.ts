const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "eXVpsk0LiHJMBbrHea-3gbEq7DBE1kixU1oOkNOjE3s";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";

const CUSTOMER_ORG = "808808773";
const PROMPT_EUR = 2336;
const ORIGINAL_RATE = 11.17;
const SETTLEMENT_RATE = 12.13;

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
  const inv = await api("GET", "/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23&fields=*,currency(*),customer(*)&count=1000&sorting=-invoiceDate");
  const invoices = inv.values || [];
  console.log(`Found ${invoices.length} invoices total`);

  // Try EUR first
  let target = invoices.find((i: any) =>
    i.customer?.organizationNumber === CUSTOMER_ORG &&
    i.amountCurrencyOutstanding > 0 &&
    i.currency?.code !== "NOK" &&
    i.amount !== i.amountCurrency
  );

  let isEur = !!target;

  if (!isEur) {
    // NOK fallback — match by amountExcludingVat
    target = invoices.find((i: any) =>
      i.customer?.organizationNumber === CUSTOMER_ORG &&
      i.amountOutstanding > 0 &&
      Math.abs(i.amountExcludingVat - PROMPT_EUR) < 0.01
    );
    if (!target) {
      // Try amountExcludingVatCurrency
      target = invoices.find((i: any) =>
        i.customer?.organizationNumber === CUSTOMER_ORG &&
        i.amountOutstanding > 0 &&
        Math.abs(i.amountExcludingVatCurrency - PROMPT_EUR) < 0.01
      );
    }
  }

  if (!target) throw new Error("No matching invoice found");
  console.log(`Located invoice ${target.id} (inv#${target.invoiceNumber}), currency=${target.currency?.code}, amount=${target.amount}, amountCurrency=${target.amountCurrency}, outstanding=${target.amountOutstanding}, outstandingCurrency=${target.amountCurrencyOutstanding}`);

  // Re-check EUR vs NOK
  isEur = target.currency?.code !== "NOK" && target.amount !== target.amountCurrency;
  console.log(`Invoice is ${isEur ? "EUR (foreign)" : "NOK (company currency)"}`);

  // Call 2: Resolve payment type
  const pt = await api("GET", "/invoice/paymentType?fields=*,debitAccount(*)&count=1000");
  const types = pt.values || [];
  let payType = types.find((t: any) => {
    const num = String(t.debitAccount?.number || "");
    return num >= "1900" && num < "2000" && t.debitAccount?.isBankAccount === true;
  });
  if (!payType) {
    payType = types.find((t: any) => {
      const num = String(t.debitAccount?.number || "");
      return num >= "1900" && num < "2000";
    });
  }
  if (!payType) {
    payType = types.find((t: any) => (t.description || "").toLowerCase().includes("bank"));
  }
  if (!payType) throw new Error("No suitable payment type found");
  console.log(`Payment type: ${payType.id} (${payType.description}), debitAccount=${payType.debitAccount?.number} (id=${payType.debitAccount?.id})`);

  const bankAccountId = payType.debitAccount?.id;

  if (isEur) {
    // EUR path: 3 calls — auto-books FX
    const paidAmountNOK = target.amountCurrencyOutstanding * SETTLEMENT_RATE;
    const paidAmountCurrency = target.amountCurrencyOutstanding;
    console.log(`EUR path: paidAmount=${paidAmountNOK}, paidAmountCurrency=${paidAmountCurrency}`);

    const payRes = await api("PUT", `/invoice/${target.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${payType.id}&paidAmount=${paidAmountNOK}&paidAmountCurrency=${paidAmountCurrency}`);
    const remaining = payRes.value?.amountCurrencyOutstanding ?? payRes.value?.amountOutstanding;
    console.log(`Payment result: remainingOutstanding=${remaining}`);

    // Verify
    const verify = await api("GET", `/invoice/${target.id}?fields=*,currency(*),customer(*)`);
    console.log(`Verify: amountCurrencyOutstanding=${verify.value?.amountCurrencyOutstanding}, amountOutstanding=${verify.value?.amountOutstanding}`);
  } else {
    // NOK fallback: 5 calls — simple payment + manual agio voucher
    console.log(`NOK path: simple payment for amountOutstanding=${target.amountOutstanding}`);

    // Call 3: Simple payment
    const payRes = await api("PUT", `/invoice/${target.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${payType.id}&paidAmount=${target.amountOutstanding}`);
    const remaining = payRes.value?.amountOutstanding ?? payRes.value?.amountCurrencyOutstanding;
    console.log(`Payment result: remainingOutstanding=${remaining}`);

    // Agio (settlement > original)
    const fxAmount = +(PROMPT_EUR * (SETTLEMENT_RATE - ORIGINAL_RATE)).toFixed(2);
    const isAgio = SETTLEMENT_RATE > ORIGINAL_RATE;
    const fxAccountNumber = isAgio ? 8060 : 8160;
    console.log(`FX ${isAgio ? "agio" : "disagio"}: ${PROMPT_EUR} × |${SETTLEMENT_RATE} - ${ORIGINAL_RATE}| = ${fxAmount} NOK, account ${fxAccountNumber}`);

    // Call 4: Resolve agio/disagio account ID
    const acctRes = await api("GET", `/ledger/account?number=${fxAccountNumber}&fields=id,number`);
    const fxAccount = acctRes.values?.[0];
    if (!fxAccount) throw new Error(`Account ${fxAccountNumber} not found`);
    console.log(`FX account: id=${fxAccount.id}, number=${fxAccount.number}`);

    // Call 5: Manual agio voucher
    let postings: any[];
    if (isAgio) {
      postings = [
        { row: 1, date: TODAY, account: { id: bankAccountId }, amountGross: fxAmount, amountGrossCurrency: fxAmount, vatType: { id: 0 }, description: "Kursgevinst innbetaling" },
        { row: 2, date: TODAY, account: { id: fxAccount.id }, amountGross: -fxAmount, amountGrossCurrency: -fxAmount, vatType: { id: 0 }, description: "Valutagevinst (agio)" },
      ];
    } else {
      postings = [
        { row: 1, date: TODAY, account: { id: fxAccount.id }, amountGross: fxAmount, amountGrossCurrency: fxAmount, vatType: { id: 0 }, description: "Valutatap (disagio)" },
        { row: 2, date: TODAY, account: { id: bankAccountId }, amountGross: -fxAmount, amountGrossCurrency: -fxAmount, vatType: { id: 0 }, description: "Kurstap innbetaling" },
      ];
    }

    const voucherRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
      date: TODAY,
      description: "Valutagevinst (agio) - kursforskjell",
      postings,
    });
    console.log(`Voucher created: id=${voucherRes.value?.id}, number=${voucherRes.value?.number}`);

    // Verify payment
    const verify = await api("GET", `/invoice/${target.id}?fields=*,currency(*),customer(*)`);
    console.log(`Verify invoice: amountOutstanding=${verify.value?.amountOutstanding}, amountCurrencyOutstanding=${verify.value?.amountCurrencyOutstanding}`);

    // Verify voucher
    if (voucherRes.value?.id) {
      const vVerify = await api("GET", `/ledger/voucher/${voucherRes.value.id}?fields=id,number,date,description,postings(row,account(number,name),amountGross,amountGrossCurrency)`);
      console.log(`Verify voucher:`, JSON.stringify(vVerify.value?.postings));
    }
  }

  console.log("DONE");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
