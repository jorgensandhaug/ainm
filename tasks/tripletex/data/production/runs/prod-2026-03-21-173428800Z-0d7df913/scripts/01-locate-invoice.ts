const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "-pijy2bVJPXFofA1MXEhRSo-imxDY9lFGjphwTzJUFM";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const url = `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&fields=*,currency(*)`;
console.log("GET", url);

const res = await fetch(url, { headers: { Authorization: AUTH } });
const data = await res.json();
console.log("Status:", res.status);
console.log("Full result size:", data.fullResultSize);

if (data.values) {
  for (const inv of data.values) {
    console.log(JSON.stringify({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customer: inv.customer,
      currency: inv.currency,
      amount: inv.amount,
      amountCurrency: inv.amountCurrency,
      amountOutstanding: inv.amountOutstanding,
      amountCurrencyOutstanding: inv.amountCurrencyOutstanding,
      amountExcludingVat: inv.amountExcludingVat,
      amountExcludingVatCurrency: inv.amountExcludingVatCurrency,
    }, null, 2));
  }
} else {
  console.log(JSON.stringify(data, null, 2));
}
