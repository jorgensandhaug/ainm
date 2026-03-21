const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// List all invoices with currency expansion
const url = `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&fields=*,currency(*)`;
console.log("GET", url);
const res = await fetch(url, { headers: { Authorization: AUTH } });
const data = await res.json();
console.log("Status:", res.status, "Count:", data.fullResultSize);

if (data.values) {
  for (const inv of data.values) {
    console.log(JSON.stringify({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      currency: inv.currency?.code,
      amount: inv.amount,
      amountCurrency: inv.amountCurrency,
      amountOutstanding: inv.amountOutstanding,
      amountCurrencyOutstanding: inv.amountCurrencyOutstanding,
      amountExcludingVat: inv.amountExcludingVat,
      amountExcludingVatCurrency: inv.amountExcludingVatCurrency,
      isCreditNote: inv.isCreditNote,
    }, null, 2));
  }
}
