const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "-NVArCGwTQSVZIym-vt5NUz_d9cvh1JbX9um4V6_-nU";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

// Known from prior inspection
const INVOICE_ID = 2147620942;
const INVOICE_OUTSTANDING = 23358.75;

// Agio calculation: 18687 EUR * (10.87 - 10.33) = 18687 * 0.54
const EUR_AMOUNT = 18687;
const RATE_DIFF = 10.87 - 10.33; // 0.54
const AGIO = Math.round(EUR_AMOUNT * RATE_DIFF * 100) / 100; // 10090.98
console.log(`Agio amount: ${AGIO} NOK`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`\n${method} ${url}`);
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

// Step 1: Parallel fetch payment types + account IDs
const [ptRes, acctRes] = await Promise.all([
  api("GET", `/invoice/paymentType?fields=*,debitAccount(*)`),
  api("GET", `/ledger/account?number=1920,8060&fields=id,number,name`),
]);

// Find bank payment type (debitAccount 19xx, isBankAccount=true)
const paymentTypes = ptRes.values || [];
let paymentType = paymentTypes.find((pt: any) => {
  const acct = pt.debitAccount;
  return acct && acct.number >= 1900 && acct.number < 2000 && acct.isBankAccount === true;
});
if (!paymentType) {
  paymentType = paymentTypes.find((pt: any) => {
    const acct = pt.debitAccount;
    return acct && acct.number >= 1900 && acct.number < 2000;
  });
}
if (!paymentType) {
  paymentType = paymentTypes.find((pt: any) =>
    pt.description?.toLowerCase().includes("bank")
  );
}
if (!paymentType) {
  console.log("ERROR: No suitable payment type found");
  process.exit(1);
}
console.log(`\nPayment type: id=${paymentType.id}, desc=${paymentType.description}, debitAccount=${paymentType.debitAccount?.number}`);

// Resolve account IDs
const accounts = acctRes.values || [];
const bankAcct = accounts.find((a: any) => a.number === 1920);
const agioAcct = accounts.find((a: any) => a.number === 8060);
if (!bankAcct || !agioAcct) {
  console.log("ERROR: Could not find required accounts");
  console.log("Found accounts:", JSON.stringify(accounts));
  process.exit(1);
}
console.log(`Bank account: id=${bankAcct.id}, number=${bankAcct.number}, name=${bankAcct.name}`);
console.log(`Agio account: id=${agioAcct.id}, number=${agioAcct.number}, name=${agioAcct.name}`);

// Step 2: Parallel - pay invoice + book agio
const [paymentRes, voucherRes] = await Promise.all([
  // Pay the invoice
  api("PUT", `/invoice/${INVOICE_ID}/:payment?paymentDate=${TODAY}&paymentTypeId=${paymentType.id}&paidAmount=${INVOICE_OUTSTANDING}`),
  // Book the agio via journal voucher
  api("POST", `/ledger/voucher?sendToLedger=true`, {
    date: TODAY,
    description: `Agio - kursdifferanse EUR ${EUR_AMOUNT} (10.33 → 10.87)`,
    postings: [
      {
        row: 0,
        account: { id: bankAcct.id },
        amountGross: AGIO,
        amountGrossCurrency: AGIO,
        description: "Agio - kursdifferanse",
      },
      {
        row: 1,
        account: { id: agioAcct.id },
        amountGross: -AGIO,
        amountGrossCurrency: -AGIO,
        description: "Agio - kursdifferanse",
      },
    ],
  }),
]);

// Verify payment
const pVal = paymentRes.value || paymentRes;
console.log(`\nPayment result: amountOutstanding=${pVal.amountOutstanding}, amountCurrencyOutstanding=${pVal.amountCurrencyOutstanding}`);

// Verify voucher
const vVal = voucherRes.value || voucherRes;
console.log(`Voucher result: id=${vVal.id}, number=${vVal.number}`);
console.log("Done.");
