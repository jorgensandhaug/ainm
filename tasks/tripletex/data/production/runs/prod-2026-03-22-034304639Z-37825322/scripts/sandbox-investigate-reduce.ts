// Investigate: can we extract account IDs from the invoice response to skip the account GET?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const txt = await r.text();
  console.log(`\n${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log(txt); return null; }
  const json = JSON.parse(txt);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

// Check if invoice response includes voucher/posting details with account IDs
const inv = await api("GET", "/invoice/2147672215?fields=*,voucher(*),postings(*),customer(*)");
console.log("Invoice voucher:", JSON.stringify(inv?.voucher, null, 2));
console.log("Invoice postings:", JSON.stringify(inv?.postings, null, 2));

// Check if the invoice includes a paymentTypeId
console.log("Invoice paymentTypeId:", inv?.paymentTypeId);
console.log("Invoice payment keys:", Object.keys(inv || {}).filter(k => k.toLowerCase().includes("payment")));

// Also check: can we get paymentType from the invoice list response?
const invoices: any[] = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-03-22&count=1&sorting=-invoiceDate&fields=*,customer(*),voucher(*),postings(*)");
if (invoices && invoices.length > 0) {
  const sample = invoices[0];
  console.log("\nSample invoice keys:", Object.keys(sample));
  console.log("Sample voucher:", JSON.stringify(sample.voucher, null, 2));
  console.log("Sample postings:", JSON.stringify(sample.postings, null, 2));
}
