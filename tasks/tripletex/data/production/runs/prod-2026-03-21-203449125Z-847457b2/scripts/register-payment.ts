const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "s290s3JF3GMvBWp-CJ7jRqST_x6WbRPOCboKeM9feOk";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const DATE = "2026-03-21";

const PROMPT_EUR = 2716;
const ORIGINAL_RATE = 10.11;
const SETTLEMENT_RATE = 9.33;

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
  if (!r.ok) {
    console.error("ERROR:", JSON.stringify(json, null, 2));
    throw new Error(`${method} ${path} → ${r.status}`);
  }
  return json;
}

async function main() {
  // Call 1: Locate invoice
  const invRes = await api("GET", `/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&fields=*,currency(*)`);
  const invoices = invRes.values || [];

  // Try EUR invoice first
  let invoice = invoices.find((inv: any) =>
    inv.currency?.code !== "NOK" &&
    inv.amountCurrencyOutstanding > 0 &&
    inv.amount !== inv.amountCurrency &&
    inv.amountExcludingVatCurrency === PROMPT_EUR
  );

  // Call 2: Get payment type
  const ptRes = await api("GET", `/invoice/paymentType?fields=*,debitAccount(*)`);
  const paymentTypes = ptRes.values || [];
  let pt = paymentTypes.find((p: any) =>
    p.debitAccount?.number >= 1900 && p.debitAccount?.number < 2000 && p.debitAccount?.isBankAccount === true
  );
  if (!pt) pt = paymentTypes.find((p: any) =>
    p.debitAccount?.number >= 1900 && p.debitAccount?.number < 2000
  );
  if (!pt) pt = paymentTypes.find((p: any) =>
    p.description?.toLowerCase().includes("bank")
  );
  if (!pt) throw new Error("No bank payment type found");
  console.log(`Payment type: ${pt.id} (${pt.description}), debitAccount: ${pt.debitAccount.number} (id=${pt.debitAccount.id})`);

  if (invoice) {
    // EUR path: 3 calls total, auto-books disagio
    const paidAmount = invoice.amountCurrencyOutstanding * SETTLEMENT_RATE;
    const payRes = await api("PUT",
      `/invoice/${invoice.id}/:payment?paymentDate=${DATE}&paymentTypeId=${pt.id}&paidAmount=${paidAmount}&paidAmountCurrency=${invoice.amountCurrencyOutstanding}`
    );
    const paid = payRes.value || payRes;
    console.log(`EUR payment done. amountCurrencyOutstanding=${paid.amountCurrencyOutstanding}, amountOutstanding=${paid.amountOutstanding}`);
    return;
  }

  // NOK fallback: find matching NOK invoice
  invoice = invoices.find((inv: any) =>
    inv.amountOutstanding > 0 &&
    inv.amountExcludingVat === PROMPT_EUR
  );
  if (!invoice) {
    // Also try amountExcludingVatCurrency for NOK invoices where both are equal
    invoice = invoices.find((inv: any) =>
      inv.amountOutstanding > 0 &&
      inv.amountExcludingVatCurrency === PROMPT_EUR
    );
  }
  if (!invoice) throw new Error(`No invoice found for ${PROMPT_EUR} EUR`);
  console.log(`NOK fallback: invoice ${invoice.id}, amountOutstanding=${invoice.amountOutstanding}`);

  // Call 3: Simple payment
  const payRes = await api("PUT",
    `/invoice/${invoice.id}/:payment?paymentDate=${DATE}&paymentTypeId=${pt.id}&paidAmount=${invoice.amountOutstanding}`
  );
  const paid = payRes.value || payRes;
  console.log(`Payment done. amountOutstanding=${paid.amountOutstanding}`);

  // Disagio: settlement rate (9.33) < original rate (10.11) → loss
  const fxAmount = +(PROMPT_EUR * Math.abs(SETTLEMENT_RATE - ORIGINAL_RATE)).toFixed(2);
  console.log(`Disagio amount: ${fxAmount} NOK`);

  // Call 4: Resolve disagio account (8160)
  const acctRes = await api("GET", `/ledger/account?number=8160&fields=id,number`);
  const disagioAcct = (acctRes.values || [])[0];
  if (!disagioAcct) throw new Error("Account 8160 not found");
  console.log(`Disagio account: id=${disagioAcct.id}, number=${disagioAcct.number}`);

  const bankAcctId = pt.debitAccount.id;

  // Call 5: Manual disagio voucher
  const voucher = await api("POST", `/ledger/voucher?sendToLedger=true`, {
    date: DATE,
    description: "Valutatap (disagio) - kursforskjell",
    postings: [
      {
        row: 1,
        date: DATE,
        account: { id: disagioAcct.id },
        amountGross: fxAmount,
        amountGrossCurrency: fxAmount,
        vatType: { id: 0 },
        description: "Valutatap (disagio)"
      },
      {
        row: 2,
        date: DATE,
        account: { id: bankAcctId },
        amountGross: -fxAmount,
        amountGrossCurrency: -fxAmount,
        vatType: { id: 0 },
        description: "Kursforskjell innbetaling"
      }
    ]
  });
  console.log(`Disagio voucher created: ${JSON.stringify(voucher.value?.id || voucher)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
