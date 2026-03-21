const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "DB7d7-AbCdjwcmXnu8UQ5yWv83-FEBTStaJh0jdVWug";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

const PROMPT_EUR_AMOUNT = 10781;       // ex-VAT EUR
const ORIGINAL_RATE = 11.03;           // NOK/EUR at invoice time
const SETTLEMENT_RATE = 11.41;         // NOK/EUR at payment time
// Agio (gain): settlement > original

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) {
    console.error("ERROR:", JSON.stringify(json, null, 2));
    throw new Error(`${method} ${path} failed with ${res.status}`);
  }
  return json;
}

// --- Call 1: Locate the invoice ---
const invoices = await api("GET", "/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&fields=*,currency(*)");
const allInv = invoices.values || [];

// Try to find a genuine EUR invoice first
const eurCandidates = allInv.filter((inv: any) =>
  inv.currency?.code !== "NOK" &&
  inv.amountCurrencyOutstanding > 0 &&
  inv.amount !== inv.amountCurrency
);

let eurInvoice = eurCandidates.find((inv: any) =>
  inv.amountExcludingVatCurrency === PROMPT_EUR_AMOUNT
);

if (eurInvoice) {
  // --- EUR path (3 calls, auto-agio) ---
  console.log(`Found EUR invoice ${eurInvoice.id}: outstanding=${eurInvoice.amountCurrencyOutstanding} ${eurInvoice.currency.code}`);

  // Call 2: Payment type
  const ptRes = await api("GET", "/invoice/paymentType?fields=*,debitAccount(*)");
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
  if (!pt) throw new Error("No suitable payment type found");
  console.log(`Payment type: ${pt.id} (${pt.description}), debitAccount=${pt.debitAccount?.number}`);

  // Call 3: Register payment with FX
  const paidAmountNOK = Math.round(eurInvoice.amountCurrencyOutstanding * SETTLEMENT_RATE * 100) / 100;
  const payRes = await api("PUT",
    `/invoice/${eurInvoice.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${pt.id}&paidAmount=${paidAmountNOK}&paidAmountCurrency=${eurInvoice.amountCurrencyOutstanding}`
  );
  console.log(`Payment registered. amountCurrencyOutstanding=${payRes.value?.amountCurrencyOutstanding}, amountOutstanding=${payRes.value?.amountOutstanding}`);
  console.log("EUR path complete — agio auto-booked by Tripletex.");

} else {
  // --- NOK fallback path (5 calls, manual agio) ---
  const nokCandidates = allInv.filter((inv: any) =>
    inv.amountOutstanding > 0 &&
    inv.amountExcludingVat === PROMPT_EUR_AMOUNT
  );
  // Also try matching with amount === amountCurrency (NOK indicator)
  const nokInvoice = nokCandidates.find((inv: any) => inv.amount === inv.amountCurrency)
    || nokCandidates[0]
    || allInv.find((inv: any) => inv.amountOutstanding > 0 && inv.amountExcludingVatCurrency === PROMPT_EUR_AMOUNT && inv.amount === inv.amountCurrency);

  if (!nokInvoice) throw new Error(`No invoice found for amount ${PROMPT_EUR_AMOUNT}`);
  console.log(`Found NOK invoice ${nokInvoice.id}: amountOutstanding=${nokInvoice.amountOutstanding}, amount=${nokInvoice.amount}, amountCurrency=${nokInvoice.amountCurrency}`);

  // Call 2: Payment type
  const ptRes = await api("GET", "/invoice/paymentType?fields=*,debitAccount(*)");
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
  if (!pt) throw new Error("No suitable payment type found");
  console.log(`Payment type: ${pt.id} (${pt.description}), debitAccount=${pt.debitAccount?.number}`);

  // Call 3: Simple payment (no FX params on NOK invoice)
  const payRes = await api("PUT",
    `/invoice/${nokInvoice.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${pt.id}&paidAmount=${nokInvoice.amountOutstanding}`
  );
  console.log(`Payment registered. amountOutstanding=${payRes.value?.amountOutstanding}`);

  // Agio: settlement rate > original rate → gain
  const fxAmount = Math.round(PROMPT_EUR_AMOUNT * (SETTLEMENT_RATE - ORIGINAL_RATE) * 100) / 100;
  console.log(`Agio amount: ${PROMPT_EUR_AMOUNT} × (${SETTLEMENT_RATE} - ${ORIGINAL_RATE}) = ${fxAmount} NOK`);

  // Call 4: Resolve account IDs for 1920 (bank) and 8060 (agio)
  const acctRes = await api("GET", "/ledger/account?number=1920,8060&fields=id,number");
  const accounts = acctRes.values || [];
  const bankAcct = accounts.find((a: any) => a.number === 1920);
  const agioAcct = accounts.find((a: any) => a.number === 8060);
  if (!bankAcct || !agioAcct) throw new Error(`Missing accounts: bank=${bankAcct?.id}, agio=${agioAcct?.id}`);
  console.log(`Accounts: 1920→${bankAcct.id}, 8060→${agioAcct.id}`);

  // Call 5: Manual agio voucher
  const voucherRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: TODAY,
    description: "Valutagevinst (agio) - kursforskjell",
    postings: [
      { row: 1, date: TODAY, account: { id: bankAcct.id }, amountGross: fxAmount, amountGrossCurrency: fxAmount, vatType: { id: 0 }, description: "Kursgevinst innbetaling" },
      { row: 2, date: TODAY, account: { id: agioAcct.id }, amountGross: -fxAmount, amountGrossCurrency: -fxAmount, vatType: { id: 0 }, description: "Valutagevinst (agio)" },
    ],
  });
  console.log(`Agio voucher created: ${voucherRes.value?.id}`);
  console.log("NOK fallback path complete — manual agio booked on 8060.");
}
