const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { method, headers });
  const text = await r.text();
  console.log(`${method} ${path} -> ${r.status}`);
  if (!r.ok) { console.log(text.slice(0, 500)); return null; }
  return JSON.parse(text);
}

// Check invoice fields: amountOutstanding vs amountCurrencyOutstanding
const invoices = await api("GET", "invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=5&fields=*,customer(*)");
if (invoices?.values?.length) {
  const inv = invoices.values[0];
  console.log("\n=== Invoice field check ===");
  console.log("amountOutstanding:", inv.amountOutstanding);
  console.log("amountCurrencyOutstanding:", inv.amountCurrencyOutstanding);
  console.log("amount:", inv.amount);
  console.log("amountCurrency:", inv.amountCurrency);
  console.log("currency:", inv.currency?.code);
}

// Check if we can get payment type debitAccount without expanding
const ptypes = await api("GET", "invoice/paymentType?count=5&fields=*,debitAccount(*)");
if (ptypes?.values?.length) {
  console.log("\n=== Payment types ===");
  for (const pt of ptypes.values.slice(0, 5)) {
    console.log(`  id=${pt.id}, desc="${pt.description}", debitAccount.number=${pt.debitAccount?.number}`);
  }
}

// Check supplier fields
const suppliers = await api("GET", "supplier?count=5&fields=*");
if (suppliers?.values?.length) {
  console.log("\n=== Suppliers (first 3) ===");
  for (const s of suppliers.values.slice(0, 3)) {
    console.log(`  id=${s.id}, name="${s.name}"`);
  }
}

// Check accounts 1920 and 2400
const accounts = await api("GET", "ledger/account?number=1920,2400&fields=*");
if (accounts?.values?.length) {
  console.log("\n=== Accounts ===");
  for (const a of accounts.values) {
    console.log(`  id=${a.id}, number=${a.number}, name="${a.name}"`);
  }
}
