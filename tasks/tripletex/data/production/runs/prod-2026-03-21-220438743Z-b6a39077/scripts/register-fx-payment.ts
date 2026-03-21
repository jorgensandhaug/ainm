const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "9o7eg7N90xxvgz-6qPxL36OdTmXTOEmivoN-UL102ok";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const DATE = "2026-03-21";

const PROMPT_EUR = 10701;
const ORIGINAL_RATE = 10.54;
const SETTLEMENT_RATE = 11.43;

const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const opts: any = { method, headers: h };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  if (!r.ok) {
    console.error("ERROR", r.status, JSON.stringify(json));
    throw new Error(`${r.status} ${JSON.stringify(json)}`);
  }
  return json;
}

async function main() {
  // Call 1: Locate the invoice
  const invRes = await api("GET", `/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&fields=*,currency(*)`);
  const invoices = invRes.values || [];

  // Try to find a foreign currency invoice first
  let invoice = invoices.find((i: any) =>
    i.currency?.code !== "NOK" &&
    i.amountCurrencyOutstanding > 0 &&
    i.amount !== i.amountCurrency &&
    i.amountExcludingVatCurrency === PROMPT_EUR
  );

  const isEurInvoice = !!invoice;

  if (!invoice) {
    // NOK fallback: find invoice matching amountExcludingVat
    invoice = invoices.find((i: any) =>
      i.amountOutstanding > 0 &&
      i.amountExcludingVat === PROMPT_EUR
    );
  }

  if (!invoice) {
    console.error("No matching invoice found");
    console.log("All invoices:", JSON.stringify(invoices.map((i: any) => ({
      id: i.id, amount: i.amount, amountCurrency: i.amountCurrency,
      amountExcludingVat: i.amountExcludingVat, amountExcludingVatCurrency: i.amountExcludingVatCurrency,
      amountOutstanding: i.amountOutstanding, amountCurrencyOutstanding: i.amountCurrencyOutstanding,
      currency: i.currency?.code
    })), null, 2));
    process.exit(1);
  }

  console.log("Found invoice:", invoice.id, "EUR?", isEurInvoice,
    "amount:", invoice.amount, "amountCurrency:", invoice.amountCurrency,
    "outstanding:", invoice.amountOutstanding, "currOutstanding:", invoice.amountCurrencyOutstanding);

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

  if (!pt) {
    console.error("No bank payment type found");
    process.exit(1);
  }

  console.log("Payment type:", pt.id, pt.description, "debitAccount:", pt.debitAccount?.number, "id:", pt.debitAccount?.id);

  if (isEurInvoice) {
    // EUR path: auto-books FX difference
    const paidAmountCurrency = invoice.amountCurrencyOutstanding;
    const paidAmount = Math.round(paidAmountCurrency * SETTLEMENT_RATE * 100) / 100;

    const payRes = await api("PUT",
      `/invoice/${invoice.id}/:payment?paymentDate=${DATE}&paymentTypeId=${pt.id}&paidAmount=${paidAmount}&paidAmountCurrency=${paidAmountCurrency}`
    );
    console.log("Payment registered. Outstanding:", payRes.value?.amountOutstanding, "CurrOutstanding:", payRes.value?.amountCurrencyOutstanding);
    console.log("Done (EUR path, 3 calls)");
  } else {
    // NOK fallback: simple payment + manual agio voucher
    // Call 3: Register simple payment
    const payRes = await api("PUT",
      `/invoice/${invoice.id}/:payment?paymentDate=${DATE}&paymentTypeId=${pt.id}&paidAmount=${invoice.amountOutstanding}`
    );
    console.log("Payment registered. Outstanding:", payRes.value?.amountOutstanding);

    // Determine agio vs disagio
    const isAgio = SETTLEMENT_RATE > ORIGINAL_RATE;
    const fxAccount = isAgio ? 8060 : 8160;
    const fxAmount = Math.round(PROMPT_EUR * Math.abs(SETTLEMENT_RATE - ORIGINAL_RATE) * 100) / 100;

    console.log(isAgio ? "AGIO" : "DISAGIO", "amount:", fxAmount, "account:", fxAccount);

    // Call 4: Resolve agio/disagio account ID
    const acctRes = await api("GET", `/ledger/account?number=${fxAccount}&fields=id,number`);
    const fxAcct = (acctRes.values || [])[0];
    if (!fxAcct) {
      console.error(`Account ${fxAccount} not found`);
      process.exit(1);
    }
    console.log("FX account:", fxAcct.id, fxAcct.number);

    const bankAcctId = pt.debitAccount.id;

    // Call 5: Book the FX difference manually
    const voucherBody = isAgio ? {
      date: DATE,
      description: "Valutagevinst (agio) - kursforskjell",
      postings: [
        { row: 1, date: DATE, account: { id: bankAcctId }, amountGross: fxAmount, amountGrossCurrency: fxAmount, vatType: { id: 0 }, description: "Kursgevinst innbetaling" },
        { row: 2, date: DATE, account: { id: fxAcct.id }, amountGross: -fxAmount, amountGrossCurrency: -fxAmount, vatType: { id: 0 }, description: "Valutagevinst (agio)" }
      ]
    } : {
      date: DATE,
      description: "Valutatap (disagio) - kursforskjell",
      postings: [
        { row: 1, date: DATE, account: { id: fxAcct.id }, amountGross: fxAmount, amountGrossCurrency: fxAmount, vatType: { id: 0 }, description: "Valutatap (disagio)" },
        { row: 2, date: DATE, account: { id: bankAcctId }, amountGross: -fxAmount, amountGrossCurrency: -fxAmount, vatType: { id: 0 }, description: "Kurstap innbetaling" }
      ]
    };

    const vRes = await api("POST", `/ledger/voucher?sendToLedger=true`, voucherBody);
    console.log("Voucher created:", vRes.value?.id);
    console.log("Done (NOK fallback, 5 calls)");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
