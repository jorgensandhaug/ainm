// Optimal full test: simulate the exact production task in sandbox
// Task: NOK invoice (18687 ex-VAT), pay it, post agio for rate change 10.33 → 10.87
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

let callCount = 0;
async function api(method: string, path: string, body?: any) {
  callCount++;
  const url = `${BASE}${path}`;
  console.log(`\n[Call #${callCount}] ${method} ${url}`);
  const opts: RequestInit = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`Status: ${res.status}`);
  let data;
  try { data = JSON.parse(text); } catch { console.log("Raw:", text); return null; }
  if (!res.ok) { console.log("Error:", JSON.stringify(data, null, 2)); return null; }
  return data;
}

// ==== PARALLEL BATCH: 3 independent GETs ====
const [invoiceRes, ptRes, acctRes] = await Promise.all([
  // Call 1: Find the invoice
  api("GET", "/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&fields=*,currency(*)"),
  // Call 2: Get payment types (also gives us bank account ID for voucher)
  api("GET", "/invoice/paymentType?fields=*,debitAccount(*)"),
  // Call 3: Get agio account ID
  api("GET", "/ledger/account?number=8060&fields=id,number"),
]);

// Process invoice
const invoices = invoiceRes?.values || [];
const invoice = invoices.find((inv: any) =>
  inv.amountOutstanding > 0 &&
  Math.abs(inv.amountExcludingVat - 18687) < 1 // match by ex-VAT amount
);
if (!invoice) {
  console.log("ERROR: No matching invoice found");
  console.log("All invoices:", invoices.map((i: any) => `id=${i.id} exVat=${i.amountExcludingVat} outstanding=${i.amountOutstanding}`));
  process.exit(1);
}
console.log(`\nInvoice: id=${invoice.id} amount=${invoice.amount} outstanding=${invoice.amountOutstanding} currency=${invoice.currency?.code}`);

// Process payment type
const paymentTypes = ptRes?.values || [];
let pt = paymentTypes.find((p: any) => p.debitAccount?.number >= 1900 && p.debitAccount?.number < 2000 && p.debitAccount?.isBankAccount);
if (!pt) pt = paymentTypes.find((p: any) => p.debitAccount?.number >= 1900 && p.debitAccount?.number < 2000);
if (!pt) { console.log("ERROR: No payment type found"); process.exit(1); }
console.log(`Payment type: id=${pt.id} desc=${pt.description} bankAccountId=${pt.debitAccount.id}`);
const bankAccountId = pt.debitAccount.id;

// Process agio account
const agioAcct = acctRes?.values?.[0];
if (!agioAcct) { console.log("ERROR: Account 8060 not found"); process.exit(1); }
console.log(`Agio account: id=${agioAcct.id} number=${agioAcct.number}`);

// ==== CALL 4: Register payment ====
const payRes = await api("PUT",
  `/invoice/${invoice.id}/:payment?paymentDate=2026-03-21&paymentTypeId=${pt.id}&paidAmount=${invoice.amountOutstanding}`
);
console.log(`Payment result: amountOutstanding=${payRes?.value?.amountOutstanding}`);

// ==== CALL 5: Post agio voucher ====
// Agio = 18687 EUR * (10.87 - 10.33) = 18687 * 0.54 = 10090.98
const agio = Math.round(18687 * (10.87 - 10.33) * 100) / 100;
console.log(`Agio amount: ${agio}`);

const voucherRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-03-21",
  description: "Valutagevinst (agio) - kursendring EUR/NOK",
  postings: [
    {
      row: 1,
      account: { id: bankAccountId },
      amount: agio,
      amountCurrency: agio,
      amountGross: agio,
      amountGrossCurrency: agio,
    },
    {
      row: 2,
      account: { id: agioAcct.id },
      amount: -agio,
      amountCurrency: -agio,
      amountGross: -agio,
      amountGrossCurrency: -agio,
    },
  ],
});

if (voucherRes?.value) {
  console.log(`\nAgio voucher created: id=${voucherRes.value.id} number=${voucherRes.value.number}`);
} else {
  console.log("AGIO VOUCHER FAILED");
}

console.log(`\n=== TOTAL API CALLS: ${callCount} ===`);
console.log("Done.");
