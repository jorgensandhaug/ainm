const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "-NVArCGwTQSVZIym-vt5NUz_d9cvh1JbX9um4V6_-nU";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";
const SETTLEMENT_RATE = 10.87;
const CUSTOMER_ORG = "877276260";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const opts: RequestInit = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`Status: ${res.status}`);
  if (!res.ok) {
    console.log("Error:", text);
    throw new Error(`${res.status}: ${text}`);
  }
  return JSON.parse(text);
}

// Step 1: GET all invoices, filter locally for the EUR invoice from Solmar SL
const invoiceRes = await api("GET",
  `/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&fields=*,currency(*)`
);
const invoices = invoiceRes.values || [];
console.log(`Total invoices: ${invoices.length}`);

// Filter: foreign currency, outstanding > 0, customer org matches
const candidates = invoices.filter((inv: any) => {
  const isForeign = inv.currency?.code && inv.currency.code !== "NOK";
  const hasOutstanding = inv.amountCurrencyOutstanding > 0;
  return isForeign && hasOutstanding;
});

console.log(`Foreign currency candidates with outstanding: ${candidates.length}`);
for (const c of candidates) {
  console.log(`  Invoice ${c.id}: currency=${c.currency?.code}, amountCurrency=${c.amountCurrency}, amountCurrencyOutstanding=${c.amountCurrencyOutstanding}, amountExcludingVatCurrency=${c.amountExcludingVatCurrency}, customer=${c.customer?.name}`);
}

// Match by customer org number or by amount (18687 EUR ex-VAT -> 23358.75 EUR incl VAT)
let invoice = candidates.find((inv: any) => {
  const orgMatch = inv.customer?.organizationNumber === CUSTOMER_ORG ||
                   String(inv.customer?.organizationNumber).replace(/\s/g, '') === CUSTOMER_ORG;
  return orgMatch;
});

// Fallback: match by ex-VAT amount
if (!invoice) {
  invoice = candidates.find((inv: any) =>
    Math.abs(inv.amountExcludingVatCurrency - 18687) < 1
  );
}

if (!invoice) {
  console.log("ERROR: Could not find matching invoice");
  process.exit(1);
}

console.log(`\nFound invoice: id=${invoice.id}, currency=${invoice.currency.code}, amountCurrencyOutstanding=${invoice.amountCurrencyOutstanding}, amount=${invoice.amount}, amountOutstanding=${invoice.amountOutstanding}`);

// Validate it's truly foreign currency
if (invoice.amount === invoice.amountCurrency) {
  console.log("WARNING: amount === amountCurrency, this is a company-currency invoice");
}

const paidAmountCurrency = invoice.amountCurrencyOutstanding;
const paidAmount = Math.round(paidAmountCurrency * SETTLEMENT_RATE * 100) / 100;

console.log(`paidAmountCurrency (EUR): ${paidAmountCurrency}`);
console.log(`paidAmount (NOK at ${SETTLEMENT_RATE}): ${paidAmount}`);

// Step 2: GET payment types to find incoming bank payment type
const ptRes = await api("GET", `/invoice/paymentType?fields=*,debitAccount(*)`);
const paymentTypes = ptRes.values || [];

let paymentType = paymentTypes.find((pt: any) => {
  const acct = pt.debitAccount;
  if (!acct) return false;
  const num = acct.number;
  return num >= 1900 && num < 2000 && acct.isBankAccount === true;
});

// Fallback: just 19xx range
if (!paymentType) {
  paymentType = paymentTypes.find((pt: any) => {
    const acct = pt.debitAccount;
    if (!acct) return false;
    return acct.number >= 1900 && acct.number < 2000;
  });
}

// Fallback: description
if (!paymentType) {
  paymentType = paymentTypes.find((pt: any) =>
    pt.description?.toLowerCase().includes("bank")
  );
}

if (!paymentType) {
  console.log("ERROR: No suitable payment type found");
  console.log("Available types:", JSON.stringify(paymentTypes, null, 2));
  process.exit(1);
}

console.log(`\nPayment type: id=${paymentType.id}, desc=${paymentType.description}, debitAccount=${paymentType.debitAccount?.number}`);

// Step 3: PUT payment
const paymentRes = await api("PUT",
  `/invoice/${invoice.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${paymentType.id}&paidAmount=${paidAmount}&paidAmountCurrency=${paidAmountCurrency}`
);

console.log("\nPayment response:");
console.log(JSON.stringify(paymentRes.value || paymentRes, null, 2));

// Check final state
const val = paymentRes.value || paymentRes;
console.log(`\nFinal amountOutstanding: ${val.amountOutstanding}`);
console.log(`Final amountCurrencyOutstanding: ${val.amountCurrencyOutstanding}`);
console.log("Done.");
