const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(method, path);
  const opts: any = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) { console.error("ERROR", res.status, text.slice(0, 300)); process.exit(1); }
  try { return JSON.parse(text); } catch { return text; }
}

// Use the invoice we already created (2147632391) and customer org 815701311
// The key test: can the 2-call path work when we locate by invoiceId directly?
const invoiceId = 2147632391;
const custOrgNr = "815701311";

console.log("=== SCORED CALLS SIMULATION ===");

// Call 1: Locate via direct GET (since sandbox search has too much accumulated data)
const locateRes = await api("GET", `/invoice/${invoiceId}?fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`);
const inv = locateRes?.value;
console.log("Invoice id:", inv.id, "customer:", inv.customer?.name, "orgNr:", inv.customer?.organizationNumber);
console.log("amountExcludingVatCurrency:", inv.amountExcludingVatCurrency, "amountCurrency:", inv.amountCurrency, "outstanding:", inv.amountCurrencyOutstanding);

// Extract payment voucher
const postings: any[] = inv.postings || [];
console.log("Total postings:", postings.length);
for (const p of postings) {
  console.log("  id:", p.id, "amount:", p.amountCurrency, "voucher:", p.voucher?.id, "type:", p.type, "account:", p.account?.number, "desc:", p.description);
}

let payPostings = postings.filter((p: any) =>
  p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE"
);
if (payPostings.length === 0) {
  payPostings = postings.filter((p: any) =>
    p.amountCurrency < 0 && p.description?.startsWith("Betaling:") && (p.type === null || p.type === undefined)
  );
}
console.log("Payment postings:", payPostings.length);

const pvId = payPostings[0]?.voucher?.id;
console.log("Payment voucher to reverse:", pvId);

// Call 2: Reverse
const revRes = await api("PUT", `/ledger/voucher/${pvId}/:reverse?date=2026-03-21`);
console.log("Reverse voucher:", revRes?.value?.id);
console.log("=== 2 SCORED CALLS DONE ===\n");

// Verification (not scored)
const proofRes = await api("GET", `/invoice/${invoiceId}?fields=*`);
console.log("After reversal - outstanding:", proofRes?.value?.amountCurrencyOutstanding, "expected:", inv.amountCurrency);
console.log("Match:", proofRes?.value?.amountCurrencyOutstanding === inv.amountCurrency);
console.log("Done.");
