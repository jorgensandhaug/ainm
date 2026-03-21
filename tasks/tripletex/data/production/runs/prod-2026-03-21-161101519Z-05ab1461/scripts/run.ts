const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "Fbh-4aBGcmDwiukykGmdKkSarkoKfzyWb2EMg_SO87A";
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
  if (!r.ok) { console.log(JSON.stringify(data, null, 2)); throw new Error(`${r.status}`); }
  return data;
}

async function main() {
  // Already retrieved from previous run:
  // Invoice 2147607989: amountCurrencyOutstanding=2565, amountOutstanding=2565
  // amountExcludingVat=2052 (matches task's 2052 EUR)
  // Total with 25% VAT: 2052 * 1.25 = 2565
  // Payment type "Betalt til bank" id=36648297, currencyCode=NOK

  const invoiceId = 2147607989;
  const paymentTypeId = 36648297;

  // Task: 2052 EUR invoice (2565 EUR incl VAT) at original rate 10.97 NOK/EUR
  // Customer paid at rate 10.01 NOK/EUR
  // paidAmountCurrency = invoice currency outstanding = 2565 EUR
  // paidAmount = 2565 * 10.01 = 25675.65 NOK (settlement in company currency)
  const paidAmountCurrency = 2565;
  const paidAmount = 2565 * 10.01; // = 25675.65 NOK

  console.log(`Payment: ${paidAmountCurrency} EUR @ 10.01 = ${paidAmount} NOK`);

  const payRes = await api("PUT",
    `/invoice/${invoiceId}/:payment?paymentDate=2026-03-21&paymentTypeId=${paymentTypeId}&paidAmount=${paidAmount}&paidAmountCurrency=${paidAmountCurrency}`
  );

  console.log("\nPayment response:", JSON.stringify(payRes.value, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
